// Regra do modulo pedidos. Sem HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado pessoal (nome, telefone, endereco) vai para log, evento ou auditoria.
import { z } from 'zod'
import { comTransacao, notificar, ErroBanco, type Executor, type Pool, type PoolClient } from '@whaviso/shared/db'
import { hojeSp } from '@whaviso/shared/datas'
import type { StatusPedido } from '@whaviso/shared/contracts'
import type { Cifra } from '@whaviso/shared/cifra'
import { HttpError, conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { carregarDetalhe } from './detalhe'
import { destinosValidos, motivoObrigatorio, permiteCancelarLinha, podeTransicionar } from './estados'
import { comandaEscpos, comandaHtml, comandaTexto } from './impressao'
import { montarLinha, montarPedido, type LinhaEntrada, type LinhaMontada } from './montador'
import * as repo from './repo'
import * as escrita from './repo_escrita'
import type {
  ColunaKanban, KanbanQuery, PedidoCriarManualEntrada, PedidoDetalheSaida, PedidoImpressaoSaida,
  PedidoKanbanSaida, PedidoRepetirEntrada, PedidoStatusEntrada, PedidoTransicaoLoteEntrada,
  PedidoTransicaoLoteSaida,
} from './schemas'

interface PedidoParaInserir {
  clienteId: string
  enderecoId: string | null
  modalidade: PedidoCriarManualEntrada['modalidade']
  subtotal: number
  taxa: number
  total: number
  formaPagamento: PedidoDetalheSaida['forma_pagamento']
  trocoPara: number | null
  observacao: string | null
  linhas: LinhaMontada[]
  evento: Record<string, unknown>
}

export interface Ator {
  lojaId: string
  userId: string
}

const COLUNAS: readonly ColunaKanban[] = ['novo', 'em_preparo', 'saiu_entrega', 'entregue', 'problema']
const CursorSchema = z.tuple([z.string().min(1).max(40), z.uuid()])
const TETO_TOTAL = 1_000_000_000

const codificarCursor = (ts: string, id: string): string => Buffer.from(JSON.stringify([ts, id])).toString('base64url')
function decodificarCursor(c: string): { ts: string; id: string } {
  try {
    const [ts, id] = CursorSchema.parse(JSON.parse(Buffer.from(c, 'base64url').toString('utf8')))
    if (Number.isNaN(Date.parse(ts))) throw new Error('ts')
    return { ts, id }
  } catch {
    throw new HttpError(400, 'cursor_invalido', 'Cursor invalido')
  }
}

export function criarServicoPedidos(pool: Pool, cifra: () => Cifra) {
  /** Evento de realtime: so referencia (ids + status), sem PII. Dentro da transacao (sai no COMMIT). */
  const emitir = (exec: Executor, lojaId: string, pedidoId: string, status: StatusPedido) =>
    notificar(exec, {
      tipo: 'pedido.atualizado',
      loja_id: lojaId,
      payload: { pedido_id: pedidoId, loja_id: lojaId, status },
    })

  /** Barra o aceite de pedido novo quando a loja esta pausada agora ou lotou a janela. */
  async function exigirAceiteDaLoja(lojaId: string): Promise<void> {
    const estado = await repo.estadoAceiteLoja(pool, lojaId)
    if (!estado) return // loja fora do escopo ja e tratada pelos demais guards
    if (estado.pausada_agora) {
      throw conflito('loja_pausada', 'A loja esta pausada e nao aceita novos pedidos agora')
    }
    if (estado.capacidade_por_janela !== null && estado.pedidos_na_janela >= estado.capacidade_por_janela) {
      throw conflito('capacidade_excedida', 'Capacidade de pedidos da janela atingida, tente mais tarde')
    }
  }

  async function detalhe(a: Ator, id: string): Promise<PedidoDetalheSaida> {
    const p = await repo.obterPedido(pool, a.lojaId, id)
    if (!p) throw naoEncontrado('Pedido nao encontrado')
    return carregarDetalhe(pool, cifra, a.lojaId, p)
  }

  async function criarManual(a: Ator, b: PedidoCriarManualEntrada): Promise<PedidoDetalheSaida> {
    if (b.modalidade === 'entrega' && !b.endereco_id) {
      throw regraNegocio('endereco_obrigatorio', 'Pedido de entrega exige endereco')
    }
    if (b.modalidade === 'retirada' && (b.endereco_id || b.taxa_entrega_centavos > 0)) {
      throw regraNegocio('retirada_sem_entrega', 'Retirada nao tem endereco nem taxa de entrega')
    }
    // Troco so acompanha pagamento em dinheiro (o banco tambem barra via check).
    if (b.troco_para_centavos != null && b.forma_pagamento !== 'dinheiro') {
      throw regraNegocio('troco_so_dinheiro', 'Troco so se aplica a pagamento em dinheiro')
    }
    // G7: recusa aceitar pedido novo com a loja pausada ou acima da capacidade da janela.
    await exigirAceiteDaLoja(a.lojaId)
    if (!(await repo.clienteDaLoja(pool, a.lojaId, b.cliente_id))) throw naoEncontrado('Cliente nao encontrado')
    if (b.endereco_id && !(await repo.enderecoAtivoDoCliente(pool, a.lojaId, b.cliente_id, b.endereco_id))) {
      throw naoEncontrado('Endereco nao encontrado')
    }
    const cardapio = await repo.lerCardapio(pool, a.lojaId, [...new Set(b.itens.map((i) => i.item_id))])
    // Preco e nome vem SO do cardapio lido agora (snapshot); o corpo nao tem preco.
    const m = montarPedido(cardapio, b.itens, b.taxa_entrega_centavos, new Date())
    if (m.total_centavos > TETO_TOTAL) throw regraNegocio('total_acima_do_teto', 'Total acima do limite')

    const id = await inserirPedidoComRetry(a, {
      clienteId: b.cliente_id, enderecoId: b.endereco_id ?? null, modalidade: b.modalidade,
      subtotal: m.subtotal_centavos, taxa: m.taxa_entrega_centavos, total: m.total_centavos,
      formaPagamento: b.forma_pagamento ?? null, trocoPara: b.troco_para_centavos ?? null,
      observacao: b.observacao ?? null, linhas: m.linhas,
      evento: { user_id: a.userId, origem: 'manual', modalidade: b.modalidade, total_centavos: m.total_centavos },
    })
    return detalhe(a, id)
  }

  /** Insere pedido + itens + opcoes numa transacao, com retry no conflito do codigo diario. */
  async function inserirPedidoComRetry(a: Ator, p: PedidoParaInserir): Promise<string> {
    const dia = hojeSp().slice(2).replace(/-/g, '')
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      try {
        return await comTransacao(pool, async (tx: PoolClient) => {
          const codigo = await escrita.proximoCodigo(tx, a.lojaId, dia)
          const pedidoId = await escrita.inserirPedido(tx, {
            lojaId: a.lojaId, clienteId: p.clienteId, enderecoId: p.enderecoId, modalidade: p.modalidade,
            codigo, subtotal: p.subtotal, taxa: p.taxa, total: p.total, formaPagamento: p.formaPagamento,
            trocoPara: p.trocoPara, observacao: p.observacao,
          })
          for (const l of p.linhas) await escrita.inserirLinha(tx, a.lojaId, pedidoId, l)
          if (p.enderecoId) await escrita.marcarUsoEndereco(tx, a.lojaId, p.enderecoId)
          await escrita.registrarEvento(tx, { lojaId: a.lojaId, tipo: 'pedido.criado', pedidoId, detalhes: p.evento })
          await emitir(tx, a.lojaId, pedidoId, 'novo')
          return pedidoId
        })
      } catch (e) {
        // Corrida na sequencia diaria: outro pedido pegou o mesmo codigo; tenta o proximo.
        if (e instanceof ErroBanco && e.tipo === 'unique' && e.constraint === 'pedidos_codigo_loja') continue
        throw e
      }
    }
    throw conflito('codigo_indisponivel', 'Nao foi possivel gerar o codigo do pedido, tente de novo')
  }

  /**
   * G13: cria um pedido NOVO a partir de um pedido ANTERIOR do mesmo cliente/loja, reusando os itens
   * do snapshot (item_id + opcoes) reresolvidos contra o cardapio de AGORA (mesma regra do criar
   * manual: preco/disponibilidade atuais; preco nunca do corpo). Se algum item nao for mais pedivel
   * agora, rejeita 422 `itens_indisponiveis` dizendo quais. Cliente/modalidade herdam do anterior;
   * endereco, taxa, observacao e pagamento podem ser sobrescritos no corpo.
   */
  async function repetir(a: Ator, anteriorId: string, b: PedidoRepetirEntrada): Promise<PedidoDetalheSaida> {
    const anterior = await repo.obterPedido(pool, a.lojaId, anteriorId)
    if (!anterior) throw naoEncontrado('Pedido nao encontrado')
    if (!anterior.cliente_id) throw regraNegocio('pedido_sem_cliente', 'Pedido anterior sem cliente para repetir')
    const clienteId = anterior.cliente_id
    const modalidade = anterior.modalidade
    const enderecoId = b.endereco_id ?? (modalidade === 'entrega' ? anterior.endereco_id : null)
    const taxa = b.taxa_entrega_centavos ?? anterior.taxa_entrega_centavos
    const formaPagamento = b.forma_pagamento === undefined ? anterior.forma_pagamento : b.forma_pagamento
    const trocoPara = b.troco_para_centavos === undefined ? anterior.troco_para_centavos : b.troco_para_centavos
    const observacao = b.observacao === undefined ? anterior.observacao : b.observacao

    // Mesmas regras de borda do criar manual.
    if (modalidade === 'entrega' && !enderecoId) {
      throw regraNegocio('endereco_obrigatorio', 'Pedido de entrega exige endereco')
    }
    if (modalidade === 'retirada' && (enderecoId || taxa > 0)) {
      throw regraNegocio('retirada_sem_entrega', 'Retirada nao tem endereco nem taxa de entrega')
    }
    if (trocoPara != null && formaPagamento !== 'dinheiro') {
      throw regraNegocio('troco_so_dinheiro', 'Troco so se aplica a pagamento em dinheiro')
    }
    await exigirAceiteDaLoja(a.lojaId)
    if (!(await repo.clienteDaLoja(pool, a.lojaId, clienteId))) throw naoEncontrado('Cliente nao encontrado')
    if (enderecoId && !(await repo.enderecoAtivoDoCliente(pool, a.lojaId, clienteId, enderecoId))) {
      throw naoEncontrado('Endereco nao encontrado')
    }

    // Reconstroi as linhas do snapshot anterior (so itens ativos) e reresolve contra o cardapio agora.
    const { itens, opcoes } = await repo.itensDoPedido(pool, a.lojaId, anteriorId)
    const ativos = itens.filter((i) => !i.cancelado)
    if (ativos.length === 0) throw regraNegocio('pedido_sem_itens', 'Pedido anterior nao tem itens para repetir')
    const itemIds = [...new Set(ativos.map((i) => i.item_id).filter((x): x is string => x !== null))]
    const cardapio = await repo.lerCardapio(pool, a.lojaId, itemIds)
    const agora = new Date()
    const montadas: LinhaMontada[] = []
    const indisponiveis: string[] = []
    for (const it of ativos) {
      if (!it.item_id) { indisponiveis.push(it.nome_snapshot); continue } // item removido do cardapio
      const entrada: LinhaEntrada = {
        item_id: it.item_id,
        quantidade: it.quantidade,
        // Opcao sem opcao_id (removida do cardapio) sai da lista; se era de grupo obrigatorio, o
        // montador rejeita a linha e ela entra como indisponivel.
        opcoes_ids: opcoes
          .filter((o) => o.item_pedido_id === it.id && o.opcao_id !== null)
          .map((o) => o.opcao_id as string),
        observacao: it.observacao,
      }
      try {
        montadas.push(montarLinha(cardapio, entrada, agora))
      } catch {
        indisponiveis.push(it.nome_snapshot)
      }
    }
    if (indisponiveis.length > 0) {
      const lista = [...new Set(indisponiveis)].join(', ')
      throw regraNegocio('itens_indisponiveis', `Itens fora do cardapio agora, nao da para repetir: ${lista}`)
    }
    const subtotal = montadas.reduce((s, l) => s + l.total_centavos, 0)
    const total = subtotal + taxa
    if (total > TETO_TOTAL) throw regraNegocio('total_acima_do_teto', 'Total acima do limite')

    const id = await inserirPedidoComRetry(a, {
      clienteId, enderecoId, modalidade, subtotal, taxa, total, formaPagamento, trocoPara, observacao,
      linhas: montadas,
      evento: { user_id: a.userId, origem: 'manual', modalidade, total_centavos: total, repetido_de: anteriorId },
    })
    return detalhe(a, id)
  }

  /**
   * Transicao de status EM LOTE (coordenacao com o despacho e uso do painel): aplica a MESMA maquina
   * de estados do POST /:id/status a varios pedidos numa unica transacao. Tudo ou nada: se qualquer
   * pedido tiver transicao invalida, o lote inteiro e rejeitado (409). Idempotente: pedido ja no
   * status alvo e no-op (`mudou: false`). FOR UPDATE em todas as linhas serializa contra corridas.
   */
  async function transicaoLote(a: Ator, b: PedidoTransicaoLoteEntrada): Promise<PedidoTransicaoLoteSaida> {
    const ids = [...new Set(b.pedido_ids)]
    if (motivoObrigatorio(b.para) && !b.motivo) throw regraNegocio('motivo_obrigatorio', 'Informe o motivo do problema')
    const resultados = await comTransacao(pool, async (tx) => {
      const pedidos = await escrita.travarPedidos(tx, a.lojaId, ids)
      if (pedidos.length !== ids.length) throw naoEncontrado('Pedido nao encontrado')
      const invalidos = pedidos.filter((p) => p.status !== b.para && !podeTransicionar(p.status, b.para, p.modalidade))
      if (invalidos.length > 0) {
        throw conflito('transicao_invalida', `Transicao invalida para: ${invalidos.map((p) => p.codigo).join(', ')}`)
      }
      const out: PedidoTransicaoLoteSaida['resultados'] = []
      for (const p of pedidos) {
        if (p.status === b.para) {
          out.push({ pedido_id: p.id, codigo: p.codigo, de: p.status, para: b.para, mudou: false })
          continue
        }
        const r = await escrita.atualizarStatus(tx, a.lojaId, p.id, p.status, b.para, b.motivo ?? null)
        // Sob FOR UPDATE nenhuma outra transacao muda o status no meio; a guarda fecha o invariante.
        if (!r) throw conflito('status_alterado', 'Um pedido mudou de status, atualize a tela')
        await escrita.registrarEvento(tx, {
          lojaId: a.lojaId, tipo: 'pedido.status_alterado', pedidoId: p.id,
          detalhes: { user_id: a.userId, de: p.status, para: b.para },
        })
        await emitir(tx, a.lojaId, p.id, b.para)
        out.push({ pedido_id: p.id, codigo: p.codigo, de: p.status, para: b.para, mudou: true })
      }
      return out
    })
    return { resultados }
  }

  async function kanban(a: Ator, q: KanbanQuery): Promise<PedidoKanbanSaida> {
    const cursor = q.cursor ? decodificarCursor(q.cursor) : undefined
    if (cursor && !q.coluna) throw new HttpError(400, 'cursor_sem_coluna', 'Cursor exige a coluna')
    const colunas: PedidoKanbanSaida['colunas'] = {}
    for (const coluna of q.coluna ? [q.coluna] : COLUNAS) {
      const linhas = await repo.listarColuna(pool, a.lojaId, {
        status: coluna, modalidade: q.modalidade, origem: q.origem, data: q.data, cursor, limite: q.limite,
      })
      const pagina = linhas.slice(0, q.limite)
      const ultima = pagina.at(-1)
      colunas[coluna] = {
        itens: pagina.map(({ cursor_ts: _ts, ...c }) => ({ ...c, destinos: destinosValidos(c.status, c.modalidade) })),
        proximoCursor: linhas.length > q.limite && ultima ? codificarCursor(ultima.cursor_ts, ultima.id) : null,
      }
    }
    return { colunas }
  }

  async function mudarStatus(a: Ator, id: string, b: PedidoStatusEntrada): Promise<PedidoDetalheSaida> {
    const p = await repo.obterPedido(pool, a.lojaId, id)
    if (!p) throw naoEncontrado('Pedido nao encontrado')
    if (!podeTransicionar(p.status, b.para, p.modalidade)) {
      throw conflito('transicao_invalida', 'Mudanca de status nao permitida')
    }
    if (motivoObrigatorio(b.para) && !b.motivo) throw regraNegocio('motivo_obrigatorio', 'Informe o motivo do problema')
    await comTransacao(pool, async (tx) => {
      const r = await escrita.atualizarStatus(tx, a.lojaId, id, p.status, b.para, b.motivo ?? null)
      if (!r) throw conflito('status_alterado', 'O pedido mudou de status, atualize a tela')
      await escrita.registrarEvento(tx, {
        lojaId: a.lojaId, tipo: 'pedido.status_alterado', pedidoId: id,
        detalhes: { user_id: a.userId, de: p.status, para: b.para },
      })
      await emitir(tx, a.lojaId, id, b.para)
    })
    return detalhe(a, id)
  }

  async function cancelarLinha(a: Ator, pedidoId: string, itemId: string): Promise<PedidoDetalheSaida> {
    await comTransacao(pool, async (tx) => {
      const atual = await escrita.travarPedido(tx, a.lojaId, pedidoId)
      if (!atual) throw naoEncontrado('Pedido nao encontrado')
      if (!permiteCancelarLinha(atual.status)) {
        throw conflito('pedido_nao_editavel', 'Item so pode ser cancelado em novo ou em preparo')
      }
      if (!(await escrita.cancelarLinha(tx, a.lojaId, pedidoId, itemId))) throw naoEncontrado('Item nao encontrado')
      if ((await escrita.contarLinhasAtivas(tx, a.lojaId, pedidoId)) === 0) {
        throw regraNegocio('ultima_linha', 'Pedido precisa de ao menos um item; cancele o pedido como problema')
      }
      await escrita.recalcularTotais(tx, a.lojaId, pedidoId)
      await escrita.registrarEvento(tx, {
        lojaId: a.lojaId, tipo: 'pedido.item_cancelado', pedidoId,
        detalhes: { user_id: a.userId, item_pedido_id: itemId },
      })
      await emitir(tx, a.lojaId, pedidoId, atual.status)
    })
    return detalhe(a, pedidoId)
  }

  async function imprimir(
    a: Ator,
    id: string,
    formato: 'html' | 'texto' | 'escpos',
    largura: number,
  ): Promise<PedidoImpressaoSaida> {
    const d = await detalhe(a, id)
    await escrita.registrarEvento(pool, {
      lojaId: a.lojaId, tipo: 'pedido.impresso', pedidoId: id, detalhes: { user_id: a.userId, formato },
    })
    const conteudo =
      formato === 'html' ? comandaHtml(d) : formato === 'escpos' ? comandaEscpos(d, largura) : comandaTexto(d, largura)
    return { formato, conteudo }
  }

  return { criarManual, repetir, kanban, detalhe, mudarStatus, transicaoLote, cancelarLinha, imprimir }
}
