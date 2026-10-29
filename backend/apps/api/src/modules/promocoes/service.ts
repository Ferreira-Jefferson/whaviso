// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado pessoal e passado a log (so ids e centavos).
import { z } from 'zod'
import { comTransacao, ErroBanco, type Pool } from '@whaviso/shared/db'
import { conflito, HttpError, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { calcularPromocao, aplicarDesconto, type MotivoRecusa, type RegraPromocao } from './calculo'
import * as repo from './repo'
import type { PromocaoAtualizar, PromocaoCriar, PromocaoValidar } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

const MENSAGENS: Record<MotivoRecusa, string> = {
  cupom_inexistente: 'Cupom nao encontrado',
  cupom_inativo: 'Cupom desativado',
  cupom_nao_iniciado: 'Cupom ainda nao esta valido',
  cupom_expirado: 'Cupom expirado',
  cupom_esgotado: 'Cupom esgotado',
  cupom_cliente_esgotado: 'Cupom ja utilizado o maximo de vezes por este cliente',
  pedido_abaixo_minimo: 'Pedido abaixo do valor minimo do cupom',
  combo_incompleto: 'Os itens do combo nao estao no pedido',
}

const CursorSchema = z.tuple([z.string().min(1).max(40), z.uuid()])
const codificarCursor = (ts: string, id: string) =>
  Buffer.from(JSON.stringify([ts, id])).toString('base64url')
function decodificarCursor(c: string): { ts: string; id: string } {
  try {
    const [ts, id] = CursorSchema.parse(JSON.parse(Buffer.from(c, 'base64url').toString('utf8')))
    if (Number.isNaN(Date.parse(ts))) throw new Error('ts')
    return { ts, id }
  } catch {
    throw new HttpError(400, 'cursor_invalido', 'Cursor invalido')
  }
}

export function criarServicoPromocoes(pool: Pool, agora: () => Date = () => new Date()) {
  const evento = (a: Ator, tipo: string, id: string) =>
    repo.registrarEvento(pool, { lojaId: a.lojaId, tipo, entidadeId: id, userId: a.userId })

  async function montarDtos(a: Ator, linhas: repo.PromocaoLinha[]) {
    const itens = await repo.itensDaPromocao(pool, a.lojaId, linhas.map((l) => l.id))
    return linhas.map((l) => ({
      ...l,
      itens: itens
        .filter((i) => i.promocao_id === l.id)
        .map((i) => ({ item_id: i.item_id, quantidade: i.quantidade })),
    }))
  }

  async function dto(a: Ator, id: string) {
    const l = await repo.obter(pool, a.lojaId, id)
    if (!l) throw naoEncontrado('Promocao nao encontrada')
    return (await montarDtos(a, [l]))[0]!
  }

  async function regraDe(a: Ator, l: repo.PromocaoLinha): Promise<RegraPromocao> {
    const itens = l.tipo === 'combo' ? await repo.itensDaPromocao(pool, a.lojaId, [l.id]) : []
    return { ...l, itens: itens.map((i) => ({ item_id: i.item_id, quantidade: i.quantidade })) }
  }

  /** Avalia o codigo: devolve a promocao e o resultado (sem lancar para recusa de negocio). */
  async function avaliar(a: Ator, e: PromocaoValidar) {
    if (e.cliente_id && !(await repo.clienteExiste(pool, a.lojaId, e.cliente_id))) {
      throw naoEncontrado('Cliente nao encontrado')
    }
    const l = await repo.obterPorCodigo(pool, a.lojaId, e.codigo)
    if (!l) return { promocao: null, resultado: { valido: false as const, motivo: 'cupom_inexistente' as const } }
    const usos = await repo.contarUsos(pool, l.id, e.cliente_id ?? null)
    const resultado = calcularPromocao(await regraDe(a, l), {
      agora: agora(),
      subtotal_centavos: e.subtotal_centavos,
      linhas: e.linhas,
      usos_total: usos.total,
      usos_cliente: usos.cliente,
      tem_cliente: Boolean(e.cliente_id),
    })
    return { promocao: l, resultado }
  }

  function saida(e: PromocaoValidar, r: Awaited<ReturnType<typeof avaliar>>) {
    const desconto = r.resultado.valido ? r.resultado.desconto_centavos : 0
    return {
      valido: r.resultado.valido,
      motivo: r.resultado.valido ? null : r.resultado.motivo,
      promocao_id: r.promocao?.id ?? null,
      desconto_centavos: desconto,
      subtotal_centavos: e.subtotal_centavos,
      total_centavos: aplicarDesconto(e.subtotal_centavos, desconto),
    }
  }

  /** `valor` precisa respeitar o tipo (CHECK do banco reforca; aqui a mensagem e amigavel). */
  function validarValor(tipo: string, valor: number) {
    if (tipo === 'cupom_percentual' && (valor < 1 || valor > 100)) {
      throw regraNegocio('valor_invalido', 'Percentual deve ficar entre 1 e 100')
    }
    if (tipo === 'cupom_fixo' && valor < 1) throw regraNegocio('valor_invalido', 'Desconto deve ser maior que zero')
  }

  return {
    async listar(a: Ator, f: { ativo?: boolean; tipo?: string; cursor?: string; limite: number }) {
      const linhas = await repo.listar(pool, a.lojaId, {
        ativo: f.ativo,
        tipo: f.tipo,
        cursor: f.cursor ? decodificarCursor(f.cursor) : undefined,
        limite: f.limite,
      })
      const pagina = linhas.slice(0, f.limite)
      const ultima = pagina[pagina.length - 1]
      return {
        itens: await montarDtos(a, pagina),
        proximoCursor: linhas.length > f.limite && ultima ? codificarCursor(ultima.criado_em, ultima.id) : null,
      }
    },

    detalhe: (a: Ator, id: string) => dto(a, id),

    async criar(a: Ator, e: PromocaoCriar) {
      validarValor(e.tipo, e.valor)
      if (e.tipo === 'combo') {
        const ids = e.itens!.map((i) => i.item_id)
        if ((await repo.contarItensDaLoja(pool, a.lojaId, ids)) !== ids.length) {
          throw regraNegocio('item_invalido', 'Item do combo nao pertence a esta loja')
        }
      }
      try {
        const id = await comTransacao(pool, async (tx) => {
          const novo = await repo.inserir(tx, a.lojaId, a.userId, {
            nome: e.nome, tipo: e.tipo, codigo: e.codigo ?? null, valor: e.valor,
            inicio_em: e.inicio_em ?? null, fim_em: e.fim_em ?? null,
            limite_total: e.limite_total ?? null, limite_por_cliente: e.limite_por_cliente ?? null,
            min_pedido_centavos: e.min_pedido_centavos,
            desconto_maximo_centavos: e.desconto_maximo_centavos ?? null, ativo: e.ativo,
          })
          for (const i of e.itens ?? []) await repo.inserirItem(tx, a.lojaId, novo, i)
          return novo
        })
        await evento(a, 'promocao.criada', id)
        return await dto(a, id)
      } catch (erro) {
        if (erro instanceof ErroBanco && erro.tipo === 'unique') {
          throw conflito('codigo_ja_existe', 'Ja existe promocao com este codigo na loja')
        }
        throw erro
      }
    },

    async atualizar(a: Ator, id: string, p: PromocaoAtualizar) {
      const atual = await repo.obter(pool, a.lojaId, id)
      if (!atual) throw naoEncontrado('Promocao nao encontrada')
      if (p.valor !== undefined) validarValor(atual.tipo, p.valor)
      const ini = p.inicio_em !== undefined ? p.inicio_em : atual.inicio_em
      const fim = p.fim_em !== undefined ? p.fim_em : atual.fim_em
      if (ini && fim && Date.parse(fim) <= Date.parse(ini)) {
        throw regraNegocio('janela_invalida', 'O fim deve ser depois do inicio')
      }
      await repo.atualizar(pool, a.lojaId, id, p as Record<string, string | number | boolean | null>)
      await evento(a, p.ativo === false ? 'promocao.desativada' : 'promocao.atualizada', id)
      return dto(a, id)
    },

    /** 200 com `valido`/`motivo` (consulta de balcao/atendente; recusa nao e erro HTTP). */
    async validar(a: Ator, e: PromocaoValidar) {
      return saida(e, await avaliar(a, e))
    },

    /** Igual a validar, mas recusa vira 422 com o motivo como `error.code`. */
    async aplicar(a: Ator, e: PromocaoValidar) {
      const r = await avaliar(a, e)
      if (!r.resultado.valido) throw regraNegocio(r.resultado.motivo, MENSAGENS[r.resultado.motivo])
      return saida(e, r)
    },

    /**
     * Registra o uso ao confirmar o pedido. Idempotente por (promocao, pedido). Trava a linha da
     * promocao (FOR UPDATE) para os limites nao estourarem sob concorrencia.
     */
    async registrarUso(
      a: Ator,
      // `desconto_centavos` do corpo e IGNORADO: o desconto gravado e recomputado no servidor pela
      // regra da promocao (mesma engine do validar/aplicar), sobre o subtotal/linhas reais do pedido.
      e: { promocao_id: string; pedido_id: string; cliente_id?: string },
    ) {
      const pedido = await repo.obterPedido(pool, a.lojaId, e.pedido_id)
      if (!pedido) throw naoEncontrado('Pedido nao encontrado')
      if (e.cliente_id && !(await repo.clienteExiste(pool, a.lojaId, e.cliente_id))) {
        throw naoEncontrado('Cliente nao encontrado')
      }
      return comTransacao(pool, async (tx) => {
        const p = await repo.obter(tx, a.lojaId, e.promocao_id, true)
        if (!p) throw naoEncontrado('Promocao nao encontrada')
        const ja = await repo.usoExistente(tx, p.id, e.pedido_id)
        if (ja) {
          return { id: ja.id, promocao_id: p.id, pedido_id: e.pedido_id, desconto_centavos: ja.desconto_centavos, criado: false }
        }
        const usos = await repo.contarUsos(tx, p.id, e.cliente_id ?? null)
        if (p.limite_total !== null && usos.total >= p.limite_total) {
          throw regraNegocio('cupom_esgotado', MENSAGENS.cupom_esgotado)
        }
        if (e.cliente_id && p.limite_por_cliente !== null && usos.cliente >= p.limite_por_cliente) {
          throw regraNegocio('cupom_cliente_esgotado', MENSAGENS.cupom_cliente_esgotado)
        }
        // Recomputa o desconto pela regra (combo usa as linhas reais do pedido); nunca confia no corpo.
        const linhas =
          p.tipo === 'combo'
            ? (await repo.linhasDoPedido(tx, a.lojaId, e.pedido_id))
                .filter((l): l is { item_id: string; quantidade: number; preco_unitario_centavos: number } =>
                  l.item_id !== null,
                )
                .map((l) => ({
                  item_id: l.item_id,
                  quantidade: l.quantidade,
                  preco_unitario_centavos: l.preco_unitario_centavos,
                }))
            : undefined
        const calc = calcularPromocao(await regraDe(a, p), {
          agora: agora(),
          subtotal_centavos: pedido.subtotal_centavos,
          linhas,
          usos_total: usos.total,
          usos_cliente: usos.cliente,
          tem_cliente: Boolean(e.cliente_id),
        })
        const desconto = calc.valido ? calc.desconto_centavos : 0
        const id = await repo.inserirUso(tx, {
          promocaoId: p.id, lojaId: a.lojaId, pedidoId: e.pedido_id,
          clienteId: e.cliente_id ?? null, desconto,
        })
        return { id, promocao_id: p.id, pedido_id: e.pedido_id, desconto_centavos: desconto, criado: true }
      })
    },
  }
}
