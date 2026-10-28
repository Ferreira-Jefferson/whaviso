// Effetivador: o motor aplica os efeitos propostos pelo node, em ordem, numa transacao. Aqui mora
// a fronteira sagrada: o node PROPOE (estado, criar_endereco, criar_pedido, handoff, encerrar); o
// motor VALIDA e EFETIVA. O preco e a taxa do pedido sao calculados AQUI (servidor, centavos), a
// partir do cardapio vivo, nunca do conteudo da mensagem.
//
// A criacao do pedido e A PROVA DE FALHA: nenhuma regra de cardapio (item sumiu, opcao invalida,
// preco) pode subir erro e abortar a transacao do turno (senao a mensagem nunca e marcada
// processada e envenena a fila global). Linha que nao reprecifica e tratada por degradacao
// elegante: avisa o cliente e volta a confirmar/escolher, nunca cria pedido divergente em silencio
// nem deixa o cliente sem resposta. Criar pedido e idempotente por conversa (guarda pedido_id).
import type { EfeitoProposto, MensagemProposta } from '@whaviso/shared/contracts'
import { ErroBanco, notificar, type PoolClient } from '@whaviso/shared/db'
import { TZ } from '@whaviso/shared/datas'
import type { ModoAtendente } from '@whaviso/shared/disponibilidade'
import { botoes, EFEITO, texto } from './acoes'
import { formatarPreco, menuCategorias } from './comum'
import { ErroMontagem, montarLinha, type LinhaSnapshot } from './cardapio'
import { resumoCarrinho } from './resumo'
import { BOTAO_CANCELAR, BOTAO_CONFIRMAR, BOTAO_MAIS } from './ids'
import { lerBairroEndereco, lerZonas } from './repo_leitura'
import { montarCobrancaPix, type PixDecifra } from './pix'
import * as escrita from './repo_escrita'
import { EstadoFluxo, type CardapioCtx, type LinhaCarrinho } from './tipos'

export interface DepsEfeito {
  tx: PoolClient
  lojaId: string
  conversaId: string
  numeroId: string
  clienteId: string
  destinatarioHash: string
  cardapio: CardapioCtx
  agora: Date
  /** Modo do atendente AGORA (disponibilidade da loja): ajusta a copy do aviso de pedido recebido. */
  modo: ModoAtendente
  /** Decifra da chave Pix (grant 0058). Ausente: o nó de pix degrada com aviso ao cliente. */
  pixDecifra?: PixDecifra
}

export interface ResultadoEfeitos {
  estado: EstadoFluxo
  handoff: boolean
  encerrar: boolean
  /** Mensagens geradas pelo motor (aviso de pedido recebido, ou degradacao de carrinho). */
  mensagensExtra: MensagemProposta[]
}

const fmtData = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: '2-digit', month: '2-digit', day: '2-digit' })
function aammdd(agora: Date): string {
  return fmtData.format(agora).replace(/-/g, '')
}

/**
 * Aviso de pedido recebido. No modo `agendamento` deixa claro que o pedido foi AGENDADO e que a
 * entrega sai dentro do horario de atendimento (nunca promete entrega imediata). Puro (testavel).
 */
export function mensagemPedidoRecebido(codigo: string, totalCentavos: number, modo: ModoAtendente): string {
  const base = `Pedido ${codigo} recebido! Total ${formatarPreco(totalCentavos)}.`
  if (modo === 'agendamento') {
    return `${base} Seu pedido foi agendado: a entrega sai dentro do horario de atendimento. Avisamos por aqui assim que comecar o preparo.`
  }
  return `${base} Avisamos por aqui quando comecar o preparo.`
}

export async function aplicarEfeitos(
  deps: DepsEfeito,
  base: EstadoFluxo,
  efeitos: readonly EfeitoProposto[],
): Promise<ResultadoEfeitos> {
  let estado = base
  let handoff = false
  let encerrar = false
  const mensagensExtra: MensagemProposta[] = []

  for (const efeito of efeitos) {
    if (efeito.tipo === EFEITO.estado) {
      estado = EstadoFluxo.parse((efeito.dados as { estado: unknown }).estado)
    } else if (efeito.tipo === EFEITO.criarEndereco) {
      estado = await efetivarEndereco(deps, estado, efeito.dados)
    } else if (efeito.tipo === EFEITO.criarPedido) {
      estado = await criarPedido(deps, estado, mensagensExtra)
    } else if (efeito.tipo === EFEITO.cobrancaPix) {
      // So apos criarPedido (precisa do id/codigo/total). Nunca lanca: degrada com aviso.
      await montarCobrancaPix(deps.tx, deps.lojaId, deps.pixDecifra, estado, mensagensExtra)
    } else if (efeito.tipo === EFEITO.handoff) {
      handoff = true
    } else if (efeito.tipo === EFEITO.encerrar) {
      encerrar = true
    }
  }

  return { estado, handoff, encerrar, mensagensExtra }
}

async function efetivarEndereco(deps: DepsEfeito, estado: EstadoFluxo, dados: Record<string, unknown>): Promise<EstadoFluxo> {
  const logradouro = String(dados['logradouro'] ?? '').trim()
  const bruto = dados['bairro']
  const bairro = typeof bruto === 'string' && bruto.trim() ? bruto.trim() : null
  if (logradouro.length < 4) return estado
  const id = await escrita.criarEndereco(deps.tx, deps.lojaId, deps.clienteId, logradouro, bairro)
  return { ...estado, endereco_id: id }
}

interface Reprecificacao {
  linhas: LinhaSnapshot[]
  subtotal: number
  invalidas: number
  carrinhoValido: LinhaCarrinho[]
}

/** Reprecifica o carrinho contra o cardapio vivo SEM nunca lancar: conta e separa as linhas invalidas. */
function reprecificar(cardapio: CardapioCtx, carrinho: readonly LinhaCarrinho[]): Reprecificacao {
  const linhas: LinhaSnapshot[] = []
  const carrinhoValido: LinhaCarrinho[] = []
  let subtotal = 0
  let invalidas = 0
  for (const l of carrinho) {
    const item = cardapio.itensPorId.get(l.item_id)
    const grupos = cardapio.gruposPorItem.get(l.item_id)
    if (!item || !grupos) {
      invalidas += 1
      continue
    }
    try {
      const m = montarLinha(item, grupos, l)
      linhas.push(m)
      carrinhoValido.push(l)
      subtotal += m.total_centavos
    } catch (erro) {
      if (erro instanceof ErroMontagem) {
        invalidas += 1
        continue
      }
      throw erro
    }
  }
  return { linhas, subtotal, invalidas, carrinhoValido }
}

/** Cria o pedido `novo` do carrinho (preco/taxa no servidor). Degrada sem criar se houver divergencia. */
async function criarPedido(deps: DepsEfeito, estado: EstadoFluxo, mensagensExtra: MensagemProposta[]): Promise<EstadoFluxo> {
  if (estado.pedido_id) return estado // ja criado nesta conversa: no-op

  const { linhas, subtotal, invalidas, carrinhoValido } = reprecificar(deps.cardapio, estado.carrinho)
  if (invalidas > 0 || linhas.length === 0) {
    return degradarCarrinho(deps, estado, carrinhoValido, mensagensExtra)
  }

  const taxa = await resolverTaxa(deps, estado.endereco_id)
  const total = subtotal + taxa
  const { pedidoId, codigo } = await inserirComCodigo(deps, estado, subtotal, taxa, total, linhas)
  if (estado.endereco_id) await escrita.marcarUsoEndereco(deps.tx, deps.lojaId, estado.endereco_id)

  await notificar(deps.tx, {
    tipo: 'pedido.atualizado',
    loja_id: deps.lojaId,
    payload: { pedido_id: pedidoId, loja_id: deps.lojaId, status: 'novo' },
  })
  await escrita.registrarEvento(deps.tx, { lojaId: deps.lojaId, tipo: 'pedido.criado', entidade: 'pedido', entidadeId: pedidoId })

  mensagensExtra.push({ tipo: 'texto', texto: mensagemPedidoRecebido(codigo, total, deps.modo) })
  return { ...estado, pedido_id: pedidoId, codigo }
}

/** Degradacao: nao cria pedido divergente. Avisa o cliente e volta a confirmar (ou a escolher). */
function degradarCarrinho(
  deps: DepsEfeito,
  estado: EstadoFluxo,
  carrinhoValido: LinhaCarrinho[],
  mensagensExtra: MensagemProposta[],
): EstadoFluxo {
  if (carrinhoValido.length === 0) {
    const menu = menuCategorias(deps.cardapio, 'Alguns itens ficaram indisponiveis. Vamos montar seu pedido de novo. Escolha uma categoria:')
    mensagensExtra.push(texto(menu.texto))
    return {
      ...estado, etapa: 'pedir_categoria', carrinho: [], apresentados: menu.ids,
      item_id: null, grupos_pendentes: [], opcoes_grupo: [], opcoes_ids: [], falhas: 0,
    }
  }
  const resumo = resumoCarrinho(deps.cardapio, carrinhoValido)
  mensagensExtra.push(
    botoes(`Um item ficou indisponivel e foi retirado.\n${resumo.texto}\n\nPosso confirmar o restante?`, [
      { id: BOTAO_CONFIRMAR, rotulo: 'Confirmar' },
      { id: BOTAO_MAIS, rotulo: 'Adicionar mais' },
      { id: BOTAO_CANCELAR, rotulo: 'Cancelar' },
    ]),
  )
  return { ...estado, etapa: 'confirmar', carrinho: carrinhoValido, apresentados: [], falhas: 0 }
}

async function resolverTaxa(deps: DepsEfeito, enderecoId: string | null): Promise<number> {
  if (!enderecoId) return 0
  const bairro = await lerBairroEndereco(deps.tx, deps.lojaId, enderecoId)
  if (!bairro) return 0
  const zonas = await lerZonas(deps.tx, deps.lojaId)
  const zona = zonas.find((z) => z.bairro === bairro)
  return zona?.taxa_cliente_centavos ?? 0
}

/**
 * Insere o pedido e suas linhas, com retry curto se o codigo diario colidir (unique por loja).
 * Cada tentativa roda num SAVEPOINT: um conflito desfaz so a tentativa (nao aborta a transacao do
 * turno), e a proxima recalcula o codigo. Concorrencia entre lojas diferentes nao colide.
 */
async function inserirComCodigo(
  deps: DepsEfeito,
  estado: EstadoFluxo,
  subtotal: number,
  taxa: number,
  total: number,
  linhas: LinhaSnapshot[],
): Promise<{ pedidoId: string; codigo: string }> {
  const dia = aammdd(deps.agora)
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    await deps.tx.query('savepoint sp_pedido')
    try {
      const codigo = await escrita.proximoCodigo(deps.tx, deps.lojaId, dia)
      const pedidoId = await escrita.inserirPedido(deps.tx, {
        lojaId: deps.lojaId, clienteId: deps.clienteId, conversaId: deps.conversaId, numeroId: deps.numeroId,
        enderecoId: estado.endereco_id, codigo, subtotal, taxa, total,
      })
      for (const l of linhas) await escrita.inserirLinha(deps.tx, deps.lojaId, pedidoId, l)
      await deps.tx.query('release savepoint sp_pedido')
      return { pedidoId, codigo }
    } catch (erro) {
      await deps.tx.query('rollback to savepoint sp_pedido')
      if (erro instanceof ErroBanco && erro.tipo === 'unique' && tentativa < 2) continue
      throw erro
    }
  }
  throw new Error('nao foi possivel gerar codigo de pedido')
}
