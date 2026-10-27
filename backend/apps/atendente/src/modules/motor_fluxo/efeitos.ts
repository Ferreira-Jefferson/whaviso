// Effetivador: o motor aplica os efeitos propostos pelo node, em ordem, numa transacao. Aqui mora
// a fronteira sagrada: o node PROPOE (estado, criar_endereco, criar_pedido, handoff, encerrar); o
// motor VALIDA e EFETIVA. O preco e a taxa do pedido sao calculados AQUI (servidor, centavos), a
// partir do cardapio vivo, nunca do conteudo da mensagem. Criar pedido e idempotente por conversa
// (guarda por estado.pedido_id).
import type { EfeitoProposto, MensagemProposta } from '@whaviso/shared/contracts'
import { ErroBanco, notificar, type PoolClient } from '@whaviso/shared/db'
import { TZ } from '@whaviso/shared/datas'
import { EFEITO } from './acoes'
import { formatarPreco } from './comum'
import { montarLinha } from './cardapio'
import { lerBairroEndereco, lerZonas } from './repo_leitura'
import * as escrita from './repo_escrita'
import { EstadoFluxo, type CardapioCtx } from './tipos'

export interface DepsEfeito {
  tx: PoolClient
  lojaId: string
  conversaId: string
  numeroId: string
  clienteId: string
  destinatarioHash: string
  cardapio: CardapioCtx
  agora: Date
}

export interface ResultadoEfeitos {
  estado: EstadoFluxo
  handoff: boolean
  encerrar: boolean
  /** Mensagens geradas pelo motor (ex.: aviso de pedido recebido com o codigo). */
  mensagensExtra: MensagemProposta[]
}

const fmtData = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: '2-digit', month: '2-digit', day: '2-digit' })
function aammdd(agora: Date): string {
  return fmtData.format(agora).replace(/-/g, '')
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
      const logradouro = String((efeito.dados as { logradouro: unknown }).logradouro ?? '').trim()
      if (logradouro.length >= 4) {
        const id = await escrita.criarEndereco(deps.tx, deps.lojaId, deps.clienteId, logradouro)
        estado = { ...estado, endereco_id: id }
      }
    } else if (efeito.tipo === EFEITO.criarPedido) {
      estado = await criarPedido(deps, estado, mensagensExtra)
    } else if (efeito.tipo === EFEITO.handoff) {
      handoff = true
    } else if (efeito.tipo === EFEITO.encerrar) {
      encerrar = true
    }
  }

  return { estado, handoff, encerrar, mensagensExtra }
}

/** Cria o pedido `novo` a partir do carrinho + cardapio vivo (preco/taxa no servidor). Idempotente. */
async function criarPedido(
  deps: DepsEfeito,
  estado: EstadoFluxo,
  mensagensExtra: MensagemProposta[],
): Promise<EstadoFluxo> {
  if (estado.pedido_id) return estado // ja criado nesta conversa: no-op

  const { linhas, subtotal } = montarLinhas(deps.cardapio, estado)
  if (linhas.length === 0) return estado // nada a criar (carrinho vazio sob o cardapio atual)

  const taxa = await resolverTaxa(deps, estado.endereco_id)
  const total = subtotal + taxa

  const { pedidoId, codigo } = await inserirComCodigo(deps, estado, subtotal, taxa, total, linhas)
  if (estado.endereco_id) await escrita.marcarUsoEndereco(deps.tx, deps.lojaId, estado.endereco_id)

  await notificar(deps.tx, {
    tipo: 'pedido.atualizado',
    loja_id: deps.lojaId,
    payload: { pedido_id: pedidoId, loja_id: deps.lojaId, status: 'novo' },
  })
  await escrita.registrarEvento(deps.tx, {
    lojaId: deps.lojaId,
    tipo: 'pedido.criado',
    entidade: 'pedido',
    entidadeId: pedidoId,
  })

  mensagensExtra.push({
    tipo: 'texto',
    texto: `Pedido ${codigo} recebido! Total ${formatarPreco(total)}. Avisamos por aqui quando comecar o preparo.`,
  })
  return { ...estado, pedido_id: pedidoId, codigo }
}

function montarLinhas(cardapio: CardapioCtx, estado: EstadoFluxo) {
  const linhas = []
  let subtotal = 0
  for (const l of estado.carrinho) {
    const item = cardapio.itensPorId.get(l.item_id)
    const grupos = cardapio.gruposPorItem.get(l.item_id)
    if (!item || !grupos) continue
    const montada = montarLinha(item, grupos, l)
    subtotal += montada.total_centavos
    linhas.push(montada)
  }
  return { linhas, subtotal }
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
  linhas: ReturnType<typeof montarLinhas>['linhas'],
): Promise<{ pedidoId: string; codigo: string }> {
  const dia = aammdd(deps.agora)
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    await deps.tx.query('savepoint sp_pedido')
    try {
      const codigo = await escrita.proximoCodigo(deps.tx, deps.lojaId, dia)
      const pedidoId = await escrita.inserirPedido(deps.tx, {
        lojaId: deps.lojaId,
        clienteId: deps.clienteId,
        conversaId: deps.conversaId,
        numeroId: deps.numeroId,
        enderecoId: estado.endereco_id,
        codigo,
        subtotal,
        taxa,
        total,
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
