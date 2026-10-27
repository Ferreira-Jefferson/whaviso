// Regras do despacho basico (manual). Sem Fastify aqui: recebe pool e dados ja validados na borda.
// Erros de dominio via shared/http_errors. Nenhum dado pessoal vai a log, evento ou auditoria.
// O `status` do pedido NUNCA e alterado aqui (maquina de estados e do modulo pedidos).
import { comTransacao, notificar, type Executor, type Pool } from '@whaviso/shared/db'
import type { StatusPedido } from '@whaviso/shared/contracts'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import type {
  CorridaDto, DespachoPainelDto, MotoboyCargaDto, ParadaDto, PedidoDespachoDto, PedidoProntoDto,
} from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

/** Atribuicao individual vale ate a saida; entregue/problema/rascunho nao entram no despacho. */
const ATRIBUIVEIS: ReadonlySet<string> = new Set(['novo', 'em_preparo', 'saiu_entrega'])
/** Compor corrida: so pedido que ainda nao saiu. */
const COMPONIVEIS: ReadonlySet<string> = new Set(['novo', 'em_preparo'])

/** Evento de realtime: so referencia (ids + status), sem PII. Dentro da transacao (sai no COMMIT). */
const emitir = (ex: Executor, lojaId: string, pedidoId: string, status: string) =>
  notificar(ex, {
    tipo: 'pedido.atualizado',
    loja_id: lojaId,
    payload: { pedido_id: pedidoId, loja_id: lojaId, status: status as StatusPedido },
  })

const evento = (
  ex: Executor, a: Ator, tipo: string, entidade: 'pedido' | 'corrida', entidadeId: string,
  detalhes: Record<string, unknown> = {},
) => repo.registrarEvento(ex, { lojaId: a.lojaId, tipo, entidade, entidadeId, detalhes: { user_id: a.userId, ...detalhes } })

/** Motoboy ativo da loja. De outra loja ou inexistente: 404 (nao confirma existencia). */
async function motoboyAtivo(ex: Executor, lojaId: string, id: string) {
  const m = await repo.buscarMotoboy(ex, lojaId, id)
  if (!m) throw naoEncontrado('Motoboy nao encontrado')
  if (!m.ativo) throw regraNegocio('motoboy_inativo', 'Motoboy inativo nao pode receber entregas')
  return { id: m.id, nome: m.nome }
}

function paraParada(p: repo.ParadaLinha): ParadaDto {
  return {
    pedido_id: p.pedido_id,
    codigo: p.codigo,
    status: p.status as StatusPedido,
    ordem_parada: p.ordem_parada,
    total_centavos: p.total_centavos,
    zona_id: p.zona_id,
    zona_nome: p.zona_nome,
    valor_motoboy_centavos: p.valor_motoboy_centavos,
    endereco: { resumo: p.endereco_resumo, bairro: p.bairro, lat: p.lat, lng: p.lng },
  }
}

function paraCorrida(c: repo.CorridaLinha, paradas: repo.ParadaLinha[]): CorridaDto {
  return {
    id: c.id,
    status: c.status,
    cancelada: c.status === 'concluida' && c.despachada_em === null,
    sugerida: c.sugerida,
    motoboy_id: c.motoboy_id,
    motoboy_nome: c.motoboy_nome,
    despachada_em: c.despachada_em,
    concluida_em: c.concluida_em,
    criado_em: c.criado_em,
    valor_motoboy_total_centavos: paradas.reduce((s, p) => s + p.valor_motoboy_centavos, 0),
    paradas: paradas.map(paraParada),
  }
}

export async function obterCorrida(ex: Executor, a: Ator, id: string): Promise<CorridaDto> {
  const c = await repo.buscarCorrida(ex, a.lojaId, id)
  if (!c) throw naoEncontrado('Corrida nao encontrada')
  return paraCorrida(c, await repo.paradasDasCorridas(ex, a.lojaId, [id]))
}

// ----------------------------------------------------------------------------- pedido

/** Valida o pedido para atribuicao/troca individual de motoboy (ja travado). */
function exigirAtribuivel(p: repo.PedidoLinha) {
  if (p.status === 'entregue') {
    throw conflito('pedido_entregue', 'Pedido ja entregue: ajuste vai por lancamento em motoboys')
  }
  if (p.modalidade !== 'entrega') throw regraNegocio('pedido_nao_entrega', 'Pedido de retirada nao tem motoboy')
  if (!ATRIBUIVEIS.has(p.status)) throw regraNegocio('pedido_nao_despachavel', 'Pedido fora de estado despachavel')
  if (p.corrida_id) {
    throw conflito('pedido_em_corrida', 'Pedido esta numa corrida: troque o motoboy pela corrida')
  }
}

async function mudarMotoboyPedido(
  pool: Pool, a: Ator, pedidoId: string, motoboyId: string | null,
): Promise<PedidoDespachoDto> {
  return comTransacao(pool, async (tx) => {
    const [p] = await repo.travarPedidos(tx, a.lojaId, [pedidoId])
    if (!p) throw naoEncontrado('Pedido nao encontrado')
    exigirAtribuivel(p)
    const novo = motoboyId ? await motoboyAtivo(tx, a.lojaId, motoboyId) : null
    if ((p.motoboy_id ?? null) !== (novo?.id ?? null)) {
      const linha = await repo.definirMotoboyPedido(tx, a.lojaId, pedidoId, novo)
      const tipo = novo === null ? 'pedido.motoboy_removido' : p.motoboy_id ? 'pedido.motoboy_trocado' : 'pedido.motoboy_atribuido'
      await evento(tx, a, tipo, 'pedido', pedidoId, { de: p.motoboy_id, para: novo?.id ?? null })
      await emitir(tx, a.lojaId, pedidoId, linha!.status)
    }
    return { pedido_id: pedidoId, motoboy_id: novo?.id ?? null, motoboy_nome: novo?.nome ?? null, corrida_id: null }
  })
}

export const atribuirMotoboyPedido = (pool: Pool, a: Ator, pedidoId: string, motoboyId: string) =>
  mudarMotoboyPedido(pool, a, pedidoId, motoboyId)

export const removerMotoboyPedido = (pool: Pool, a: Ator, pedidoId: string) =>
  mudarMotoboyPedido(pool, a, pedidoId, null)

// ----------------------------------------------------------------------------- corrida

/** Trava a corrida e exige que ainda esteja em `montando` (composicao so nesse estado). */
async function corridaEmMontagem(tx: Executor, a: Ator, id: string) {
  const c = await repo.travarCorrida(tx, a.lojaId, id)
  if (!c) throw naoEncontrado('Corrida nao encontrada')
  if (c.status !== 'montando') throw conflito('corrida_imutavel', 'Corrida ja despachada: composicao travada')
  return c
}

/** Adiciona pedidos (ja com a corrida travada). Ordem de entrada = ordem de parada. */
async function adicionarTx(tx: Executor, a: Ator, corridaId: string, motoboyId: string | null, ids: string[]) {
  const unicos = [...new Set(ids)]
  const pedidos = await repo.travarPedidos(tx, a.lojaId, unicos)
  if (pedidos.length !== unicos.length) throw naoEncontrado('Pedido nao encontrado')
  for (const p of pedidos) {
    if (p.modalidade !== 'entrega') throw regraNegocio('pedido_nao_entrega', 'Pedido de retirada nao entra em corrida')
    if (!COMPONIVEIS.has(p.status)) throw regraNegocio('pedido_nao_despachavel', 'Pedido fora de estado despachavel')
    if (p.corrida_id) throw conflito('pedido_em_corrida', 'Pedido ja esta numa corrida')
  }
  const motoboy = motoboyId ? await motoboyAtivo(tx, a.lojaId, motoboyId) : null
  let ordem = await repo.proximaOrdem(tx, a.lojaId, corridaId)
  for (const id of unicos) {
    const linha = await repo.entrarNaCorrida(tx, a.lojaId, id, corridaId, ordem++, motoboy)
    // Guarda de concorrencia: o UPDATE so pega pedido ainda sem corrida.
    if (!linha) throw conflito('pedido_em_corrida', 'Pedido ja esta numa corrida')
    await emitir(tx, a.lojaId, id, linha.status)
  }
  await evento(tx, a, 'corrida.pedidos_adicionados', 'corrida', corridaId, { pedidos: unicos.length })
}

export async function criarCorrida(
  pool: Pool, a: Ator, e: { motoboy_id?: string | undefined; pedido_ids?: string[] | undefined },
): Promise<CorridaDto> {
  const id = await comTransacao(pool, async (tx) => {
    const motoboy = e.motoboy_id ? await motoboyAtivo(tx, a.lojaId, e.motoboy_id) : null
    const novo = await repo.criarCorrida(tx, a.lojaId, motoboy?.id ?? null)
    await evento(tx, a, 'corrida.criada', 'corrida', novo, { motoboy_id: motoboy?.id ?? null })
    if (e.pedido_ids?.length) await adicionarTx(tx, a, novo, motoboy?.id ?? null, e.pedido_ids)
    return novo
  })
  return obterCorrida(pool, a, id)
}

export async function adicionarPedidos(pool: Pool, a: Ator, corridaId: string, ids: string[]): Promise<CorridaDto> {
  await comTransacao(pool, async (tx) => {
    const c = await corridaEmMontagem(tx, a, corridaId)
    await adicionarTx(tx, a, corridaId, c.motoboy_id, ids)
  })
  return obterCorrida(pool, a, corridaId)
}

export async function removerPedido(pool: Pool, a: Ator, corridaId: string, pedidoId: string): Promise<CorridaDto> {
  await comTransacao(pool, async (tx) => {
    const c = await corridaEmMontagem(tx, a, corridaId)
    const soltos = await repo.liberarPedidos(tx, a.lojaId, corridaId, c.motoboy_id, pedidoId)
    if (soltos.length === 0) throw naoEncontrado('Pedido nao esta nesta corrida')
    await repo.renumerarParadas(tx, a.lojaId, corridaId)
    await evento(tx, a, 'corrida.pedido_removido', 'corrida', corridaId)
    await emitir(tx, a.lojaId, pedidoId, soltos[0]!.status)
  })
  return obterCorrida(pool, a, corridaId)
}

export async function reordenar(pool: Pool, a: Ator, corridaId: string, ids: string[]): Promise<CorridaDto> {
  await comTransacao(pool, async (tx) => {
    await corridaEmMontagem(tx, a, corridaId)
    const atuais = await repo.idsDaCorrida(tx, a.lojaId, corridaId)
    const pedida = new Set(ids)
    const completa =
      pedida.size === ids.length && ids.length === atuais.length && atuais.every((x) => pedida.has(x))
    if (!completa) {
      throw regraNegocio('ordem_invalida', 'Informe exatamente os pedidos da corrida, sem repetir')
    }
    await repo.gravarOrdem(tx, a.lojaId, corridaId, ids)
    await evento(tx, a, 'corrida.reordenada', 'corrida', corridaId)
  })
  return obterCorrida(pool, a, corridaId)
}

/** Motoboy da corrida: propaga a todos os pedidos dela. Vale em `montando` e `despachada`. */
export async function atribuirMotoboyCorrida(
  pool: Pool, a: Ator, corridaId: string, motoboyId: string,
): Promise<CorridaDto> {
  await comTransacao(pool, async (tx) => {
    const c = await repo.travarCorrida(tx, a.lojaId, corridaId)
    if (!c) throw naoEncontrado('Corrida nao encontrada')
    if (c.status === 'concluida') throw conflito('corrida_encerrada', 'Corrida ja encerrada')
    const m = await motoboyAtivo(tx, a.lojaId, motoboyId)
    if (c.motoboy_id === m.id) return
    await repo.definirMotoboyCorrida(tx, a.lojaId, corridaId, m.id)
    const afetados = await repo.propagarMotoboy(tx, a.lojaId, corridaId, m)
    await evento(tx, a, c.motoboy_id ? 'corrida.motoboy_trocado' : 'corrida.motoboy_atribuido', 'corrida', corridaId, {
      de: c.motoboy_id, para: m.id,
    })
    for (const p of afetados) await emitir(tx, a.lojaId, p.id, p.status)
  })
  return obterCorrida(pool, a, corridaId)
}

/** Despachar: exige motoboy e >= 1 pedido; idempotente (ja despachada devolve como esta). */
export async function despachar(pool: Pool, a: Ator, corridaId: string): Promise<CorridaDto> {
  await comTransacao(pool, async (tx) => {
    const c = await repo.travarCorrida(tx, a.lojaId, corridaId)
    if (!c) throw naoEncontrado('Corrida nao encontrada')
    if (c.status === 'despachada') return
    if (c.status === 'concluida') throw conflito('corrida_encerrada', 'Corrida ja encerrada')
    if (!c.motoboy_id) throw regraNegocio('corrida_sem_motoboy', 'Atribua um motoboy antes de despachar')
    const ids = await repo.idsDaCorrida(tx, a.lojaId, corridaId)
    if (ids.length === 0) throw regraNegocio('corrida_vazia', 'Adicione ao menos um pedido antes de despachar')
    const m = await motoboyAtivo(tx, a.lojaId, c.motoboy_id)
    const afetados = await repo.propagarMotoboy(tx, a.lojaId, corridaId, m)
    await repo.marcarDespachada(tx, a.lojaId, corridaId)
    await evento(tx, a, 'corrida.despachada', 'corrida', corridaId, { pedidos: ids.length })
    for (const p of afetados) await emitir(tx, a.lojaId, p.id, p.status)
  })
  return obterCorrida(pool, a, corridaId)
}

/** Concluir: so corrida despachada; idempotente. Corrida em `montando` ainda nao saiu (409). */
export async function concluir(pool: Pool, a: Ator, corridaId: string): Promise<CorridaDto> {
  await comTransacao(pool, async (tx) => {
    const c = await repo.travarCorrida(tx, a.lojaId, corridaId)
    if (!c) throw naoEncontrado('Corrida nao encontrada')
    if (c.status === 'concluida') return
    if (c.status === 'montando') throw conflito('corrida_nao_despachada', 'Corrida ainda nao foi despachada')
    await repo.marcarConcluida(tx, a.lojaId, corridaId)
    await evento(tx, a, 'corrida.concluida', 'corrida', corridaId)
  })
  return obterCorrida(pool, a, corridaId)
}

/**
 * Cancelar: so corrida em `montando`. Libera os pedidos e encerra a corrida (sem DELETE e sem
 * novo valor de enum: fica `concluida` sem `despachada_em`, exposto como `cancelada`). Idempotente.
 */
export async function cancelar(pool: Pool, a: Ator, corridaId: string): Promise<CorridaDto> {
  await comTransacao(pool, async (tx) => {
    const c = await repo.travarCorrida(tx, a.lojaId, corridaId)
    if (!c) throw naoEncontrado('Corrida nao encontrada')
    if (c.status === 'concluida' && c.despachada_em === null) return
    if (c.status !== 'montando') throw conflito('corrida_ja_despachada', 'Corrida despachada nao pode ser cancelada')
    const soltos = await repo.liberarPedidos(tx, a.lojaId, corridaId, c.motoboy_id)
    await repo.marcarConcluida(tx, a.lojaId, corridaId)
    await evento(tx, a, 'corrida.cancelada', 'corrida', corridaId, { pedidos: soltos.length })
    for (const p of soltos) await emitir(tx, a.lojaId, p.id, p.status)
  })
  return obterCorrida(pool, a, corridaId)
}

// ----------------------------------------------------------------------------- painel

function paraPronto(p: repo.ParadaLinha): PedidoProntoDto {
  return {
    pedido_id: p.pedido_id,
    codigo: p.codigo,
    status: p.status as StatusPedido,
    total_centavos: p.total_centavos,
    zona_id: p.zona_id,
    zona_nome: p.zona_nome,
    valor_motoboy_centavos: p.valor_motoboy_centavos,
    endereco: { resumo: p.endereco_resumo, bairro: p.bairro, lat: p.lat, lng: p.lng },
    criado_em: p.criado_em,
  }
}

/** Read-model do painel: 4 queries agregadas, sem N+1. */
export async function painel(pool: Pool, a: Ator): Promise<DespachoPainelDto> {
  const [prontos, corridas, motoboys] = await Promise.all([
    repo.pedidosProntos(pool, a.lojaId),
    repo.listarCorridasAbertas(pool, a.lojaId),
    repo.motoboysComCarga(pool, a.lojaId),
  ])
  const paradas = corridas.length ? await repo.paradasDasCorridas(pool, a.lojaId, corridas.map((c) => c.id)) : []
  const porCorrida = new Map<string, repo.ParadaLinha[]>()
  for (const p of paradas) {
    const l = porCorrida.get(p.corrida_id!) ?? []
    l.push(p)
    porCorrida.set(p.corrida_id!, l)
  }
  return {
    pedidos_prontos: prontos.map(paraPronto),
    corridas: corridas.map((c) => paraCorrida(c, porCorrida.get(c.id) ?? [])),
    motoboys: motoboys as MotoboyCargaDto[],
  }
}
