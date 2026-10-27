// Leitura e escrita do despacho: SO via @whaviso/shared/db, sempre sql`...` parametrizado (SEC-080).
// Tudo filtra/carimba loja_id da loja ativa (nunca do corpo). Sem DELETE.
// Escreve em `pedidos` SOMENTE as colunas de despacho (motoboy_id, motoboy_nome, corrida_id,
// ordem_parada); o `status` do pedido nunca e alterado aqui (fica com o modulo pedidos).
// Leituras cruzadas (read-model): pedidos, enderecos, zonas_entrega, motoboys, pessoas.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

type StatusPedidoLinha = 'rascunho' | 'novo' | 'em_preparo' | 'saiu_entrega' | 'entregue' | 'problema'

// ------------------------------------------------------------------------------- motoboys

export interface MotoboyLinha {
  id: string
  nome: string
  ativo: boolean
}

export function buscarMotoboy(ex: Executor, lojaId: string, id: string) {
  return consultarUm<MotoboyLinha>(
    ex,
    sql`select m.id, coalesce(p.nome, m.nome) as nome, m.ativo
          from public.motoboys m left join public.pessoas p on p.id = m.pessoa_id
         where m.id = ${id} and m.loja_id = ${lojaId}`,
  )
}

// ------------------------------------------------------------------------------- pedidos

export interface PedidoLinha {
  id: string
  status: StatusPedidoLinha
  modalidade: 'entrega' | 'retirada'
  corrida_id: string | null
  motoboy_id: string | null
}

/** Trava as linhas (ordem por id evita deadlock entre dois operadores). So as da loja ativa. */
export function travarPedidos(ex: Executor, lojaId: string, ids: string[]) {
  return consultar<PedidoLinha>(
    ex,
    sql`select id, status, modalidade, corrida_id, motoboy_id
          from public.pedidos
         where loja_id = ${lojaId} and id = any(${ids}::uuid[])
         order by id
           for update`,
  )
}

/** Atribui (ou limpa, com null) o motoboy de um pedido; devolve o status para o realtime. */
export function definirMotoboyPedido(
  ex: Executor, lojaId: string, pedidoId: string, motoboy: { id: string; nome: string } | null,
) {
  return consultarUm<{ status: StatusPedidoLinha }>(
    ex,
    sql`update public.pedidos
           set motoboy_id = ${motoboy?.id ?? null}, motoboy_nome = ${motoboy?.nome ?? null}
         where id = ${pedidoId} and loja_id = ${lojaId}
     returning status`,
  )
}

/** Poe o pedido na corrida na parada indicada (e o motoboy da corrida, quando ela ja tem). */
export function entrarNaCorrida(
  ex: Executor, lojaId: string, pedidoId: string, corridaId: string, ordem: number,
  motoboy: { id: string; nome: string } | null,
) {
  const mid = motoboy?.id ?? null
  const mnome = motoboy?.nome ?? null
  return consultarUm<{ status: StatusPedidoLinha }>(
    ex,
    sql`update public.pedidos
           set corrida_id = ${corridaId}, ordem_parada = ${ordem},
               motoboy_id = coalesce(${mid}::uuid, motoboy_id),
               motoboy_nome = case when ${mid}::uuid is null then motoboy_nome else ${mnome}::text end
         where id = ${pedidoId} and loja_id = ${lojaId} and corrida_id is null
     returning status`,
  )
}

/**
 * Libera os pedidos da corrida (ou um so): corrida_id e ordem_parada nulos. O motoboy que veio da
 * corrida sai junto (so se for o mesmo da corrida), para o pedido voltar a "nao atribuido".
 */
export function liberarPedidos(
  ex: Executor, lojaId: string, corridaId: string, motoboyDaCorrida: string | null, pedidoId?: string,
) {
  const mc = motoboyDaCorrida
  const pid = pedidoId ?? null
  return consultar<{ id: string; status: StatusPedidoLinha }>(
    ex,
    sql`update public.pedidos
           set corrida_id = null, ordem_parada = null,
               motoboy_nome = case when motoboy_id is not distinct from ${mc}::uuid then null else motoboy_nome end,
               motoboy_id   = case when motoboy_id is not distinct from ${mc}::uuid then null else motoboy_id end
         where loja_id = ${lojaId} and corrida_id = ${corridaId}
           and (${pid}::uuid is null or id = ${pid}::uuid)
     returning id, status`,
  )
}

/** Regrava ordem_parada 1..n (sem buracos) conforme a ordem atual da corrida. */
export async function renumerarParadas(ex: Executor, lojaId: string, corridaId: string) {
  await consultar(
    ex,
    sql`update public.pedidos p set ordem_parada = n.ord
          from (select id, row_number() over (order by ordem_parada, id)::int as ord
                  from public.pedidos where loja_id = ${lojaId} and corrida_id = ${corridaId}) n
         where p.id = n.id and p.loja_id = ${lojaId}`,
  )
}

export async function gravarOrdem(ex: Executor, lojaId: string, corridaId: string, ids: string[]) {
  const ordens = ids.map((_, i) => i + 1)
  await consultar(
    ex,
    sql`update public.pedidos p set ordem_parada = v.ord
          from unnest(${ids}::uuid[], ${ordens}::int[]) as v(id, ord)
         where p.id = v.id and p.loja_id = ${lojaId} and p.corrida_id = ${corridaId}`,
  )
}

/** Propaga o motoboy da corrida a todos os pedidos dela ainda nao entregues. */
export function propagarMotoboy(
  ex: Executor, lojaId: string, corridaId: string, motoboy: { id: string; nome: string },
) {
  return consultar<{ id: string; status: StatusPedidoLinha }>(
    ex,
    sql`update public.pedidos set motoboy_id = ${motoboy.id}, motoboy_nome = ${motoboy.nome}
         where loja_id = ${lojaId} and corrida_id = ${corridaId} and status <> 'entregue'
     returning id, status`,
  )
}

export async function idsDaCorrida(ex: Executor, lojaId: string, corridaId: string): Promise<string[]> {
  const r = await consultar<{ id: string }>(
    ex,
    sql`select id from public.pedidos
         where loja_id = ${lojaId} and corrida_id = ${corridaId} order by ordem_parada, id`,
  )
  return r.map((x) => x.id)
}

export async function proximaOrdem(ex: Executor, lojaId: string, corridaId: string): Promise<number> {
  const r = await consultarUm<{ n: number }>(
    ex,
    sql`select coalesce(max(ordem_parada), 0)::int as n from public.pedidos
         where loja_id = ${lojaId} and corrida_id = ${corridaId}`,
  )
  return (r?.n ?? 0) + 1
}

// ------------------------------------------------------------------------------- corridas

export interface CorridaLinha {
  id: string
  status: 'montando' | 'despachada' | 'concluida'
  sugerida: boolean
  motoboy_id: string | null
  motoboy_nome: string | null
  despachada_em: string | null
  concluida_em: string | null
  criado_em: string
}

const COLUNAS_CORRIDA = sql`
  c.id, c.status, c.sugerida, c.motoboy_id, coalesce(pe.nome, m.nome) as motoboy_nome,
  ${TS('c.despachada_em')} as despachada_em, ${TS('c.concluida_em')} as concluida_em,
  ${TS('c.criado_em')} as criado_em`

const JUNTA_MOTOBOY = sql`left join public.motoboys m on m.id = c.motoboy_id
          left join public.pessoas pe on pe.id = m.pessoa_id`

export async function criarCorrida(ex: Executor, lojaId: string, motoboyId: string | null): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    ex,
    sql`insert into public.corridas (loja_id, motoboy_id) values (${lojaId}, ${motoboyId}) returning id`,
  )
  return r!.id
}

export interface CorridaTravada {
  id: string
  status: CorridaLinha['status']
  motoboy_id: string | null
  despachada_em: string | null
}

/** Trava a corrida da loja (serializa composicao, despacho e conclusao). */
export function travarCorrida(ex: Executor, lojaId: string, id: string) {
  return consultarUm<CorridaTravada>(
    ex,
    sql`select id, status, motoboy_id, ${TS('despachada_em')} as despachada_em
          from public.corridas where id = ${id} and loja_id = ${lojaId} for update`,
  )
}

export async function definirMotoboyCorrida(ex: Executor, lojaId: string, id: string, motoboyId: string) {
  await consultar(
    ex,
    sql`update public.corridas set motoboy_id = ${motoboyId} where id = ${id} and loja_id = ${lojaId}`,
  )
}

export async function marcarDespachada(ex: Executor, lojaId: string, id: string) {
  await consultar(
    ex,
    sql`update public.corridas set status = 'despachada', despachada_em = now()
         where id = ${id} and loja_id = ${lojaId} and status = 'montando'`,
  )
}

export async function marcarConcluida(ex: Executor, lojaId: string, id: string) {
  await consultar(
    ex,
    sql`update public.corridas set status = 'concluida', concluida_em = now()
         where id = ${id} and loja_id = ${lojaId} and status <> 'concluida'`,
  )
}

export function buscarCorrida(ex: Executor, lojaId: string, id: string) {
  return consultarUm<CorridaLinha>(
    ex,
    sql`select ${COLUNAS_CORRIDA} from public.corridas c ${JUNTA_MOTOBOY}
         where c.id = ${id} and c.loja_id = ${lojaId}`,
  )
}

/** Corridas abertas (montando/despachada) da loja, mais antigas primeiro. */
export function listarCorridasAbertas(ex: Executor, lojaId: string) {
  return consultar<CorridaLinha>(
    ex,
    sql`select ${COLUNAS_CORRIDA} from public.corridas c ${JUNTA_MOTOBOY}
         where c.loja_id = ${lojaId} and c.status in ('montando', 'despachada')
         order by c.criado_em, c.id`,
  )
}

// ------------------------------------------------------------------------------- paradas

export interface ParadaLinha {
  corrida_id: string | null
  pedido_id: string
  codigo: string
  status: StatusPedidoLinha
  ordem_parada: number | null
  total_centavos: number
  zona_id: string | null
  zona_nome: string | null
  valor_motoboy_centavos: number
  endereco_resumo: string | null
  bairro: string | null
  lat: number | null
  lng: number | null
  criado_em: string
}

const COLUNAS_PARADA = sql`
  p.corrida_id, p.id as pedido_id, p.codigo, p.status, p.ordem_parada, p.total_centavos,
  p.zona_id, z.nome as zona_nome, coalesce(z.valor_motoboy_centavos, 0)::int as valor_motoboy_centavos,
  nullif(concat_ws(', ', e.logradouro, e.numero), '') as endereco_resumo, e.bairro,
  e.lat::float8 as lat, e.lng::float8 as lng, ${TS('p.criado_em')} as criado_em`

const JUNTAS_PARADA = sql`
  left join public.zonas_entrega z on z.id = p.zona_id and z.loja_id = p.loja_id
  left join public.enderecos e on e.id = p.endereco_id and e.loja_id = p.loja_id`

/** Paradas de varias corridas numa query (sem N+1), ja ordenadas por parada. */
export function paradasDasCorridas(ex: Executor, lojaId: string, corridaIds: string[]) {
  return consultar<ParadaLinha>(
    ex,
    sql`select ${COLUNAS_PARADA} from public.pedidos p ${JUNTAS_PARADA}
         where p.loja_id = ${lojaId} and p.corrida_id = any(${corridaIds}::uuid[])
         order by p.corrida_id, p.ordem_parada, p.id`,
  )
}

export const LIMITE_PRONTOS = 200

/** Pedidos de entrega prontos para despachar: sem corrida e sem motoboy. */
export function pedidosProntos(ex: Executor, lojaId: string) {
  return consultar<ParadaLinha>(
    ex,
    sql`select ${COLUNAS_PARADA} from public.pedidos p ${JUNTAS_PARADA}
         where p.loja_id = ${lojaId} and p.modalidade = 'entrega'
           and p.status in ('novo', 'em_preparo')
           and p.corrida_id is null and p.motoboy_id is null
         order by p.criado_em, p.id
         limit ${LIMITE_PRONTOS}`,
  )
}

export interface CargaLinha {
  id: string
  nome: string
  veiculo: 'moto' | 'bicicleta' | 'carro' | 'a_pe'
  corridas_abertas: number
  pedidos_em_aberto: number
}

/** Motoboys ativos com a carga atual (agregado, uma query). */
export function motoboysComCarga(ex: Executor, lojaId: string) {
  return consultar<CargaLinha>(
    ex,
    sql`select m.id, coalesce(pe.nome, m.nome) as nome, m.veiculo,
               (select count(*)::int from public.corridas c
                 where c.loja_id = m.loja_id and c.motoboy_id = m.id
                   and c.status in ('montando', 'despachada')) as corridas_abertas,
               (select count(*)::int from public.pedidos p
                 where p.loja_id = m.loja_id and p.motoboy_id = m.id
                   and p.status in ('novo', 'em_preparo', 'saiu_entrega')) as pedidos_em_aberto
          from public.motoboys m left join public.pessoas pe on pe.id = m.pessoa_id
         where m.loja_id = ${lojaId} and m.ativo
         order by nome, m.id`,
  )
}

// ------------------------------------------------------------------------------- auditoria

/** Auditoria sem PII (tabela eventos). `detalhes` so com ids e user_id. */
export async function registrarEvento(
  ex: Executor,
  e: {
    lojaId: string
    tipo: string
    entidade: 'pedido' | 'corrida'
    entidadeId: string
    detalhes: Record<string, unknown>
  },
) {
  await consultar(
    ex,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, ${e.entidade}, ${e.entidadeId}, 'loja', ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
