// Leitura e escrita da roteirizacao: SO via @whaviso/shared/db, sempre sql`...` parametrizado (SEC-080).
// Tudo filtra/carimba loja_id da loja ativa (nunca do corpo). Sem DELETE.
// Escreve: despacho_config, enderecos (APENAS lat/lng/geocodificado_em/geocode_falha_em: este modulo e o
// dono), corridas (INSERT sugerida=true), pedidos (APENAS corrida_id/ordem_parada/motoboy_*) e eventos.
// Leituras cruzadas (read-model): pedidos, itens_pedido, enderecos, zonas_entrega, motoboys, pessoas.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

// ------------------------------------------------------------------------------- config

export interface ConfigLinha {
  preparo_base_min: number
  preparo_por_item_min: number
  max_pedidos_corrida: number
  janela_saida_min: number
  desvio_max_min: number
  origem_lat: number | null
  origem_lng: number | null
  volta_a_loja: boolean
  velocidade_media_kmh: number
}

/** Defaults de quem ainda nao configurou (espelham os defaults da tabela). */
export const CONFIG_PADRAO: ConfigLinha = {
  preparo_base_min: 20,
  preparo_por_item_min: 1,
  max_pedidos_corrida: 4,
  janela_saida_min: 10,
  desvio_max_min: 8,
  origem_lat: null,
  origem_lng: null,
  volta_a_loja: false,
  velocidade_media_kmh: 25,
}

const COLUNAS_CONFIG = sql`
  preparo_base_min::int as preparo_base_min, preparo_por_item_min::float8 as preparo_por_item_min,
  max_pedidos_corrida::int as max_pedidos_corrida, janela_saida_min::int as janela_saida_min,
  desvio_max_min::int as desvio_max_min, origem_lat::float8 as origem_lat, origem_lng::float8 as origem_lng,
  volta_a_loja, velocidade_media_kmh::int as velocidade_media_kmh`

export function buscarConfig(ex: Executor, lojaId: string) {
  return consultarUm<ConfigLinha>(
    ex, sql`select ${COLUNAS_CONFIG} from public.despacho_config where loja_id = ${lojaId}`,
  )
}

export async function gravarConfig(ex: Executor, lojaId: string, c: ConfigLinha): Promise<ConfigLinha> {
  const r = await consultarUm<ConfigLinha>(
    ex,
    sql`insert into public.despacho_config
          (loja_id, preparo_base_min, preparo_por_item_min, max_pedidos_corrida, janela_saida_min,
           desvio_max_min, origem_lat, origem_lng, volta_a_loja, velocidade_media_kmh)
        values (${lojaId}, ${c.preparo_base_min}, ${c.preparo_por_item_min}, ${c.max_pedidos_corrida},
                ${c.janela_saida_min}, ${c.desvio_max_min}, ${c.origem_lat}, ${c.origem_lng},
                ${c.volta_a_loja}, ${c.velocidade_media_kmh})
        on conflict (loja_id) do update set
          preparo_base_min = excluded.preparo_base_min, preparo_por_item_min = excluded.preparo_por_item_min,
          max_pedidos_corrida = excluded.max_pedidos_corrida, janela_saida_min = excluded.janela_saida_min,
          desvio_max_min = excluded.desvio_max_min, origem_lat = excluded.origem_lat,
          origem_lng = excluded.origem_lng, volta_a_loja = excluded.volta_a_loja,
          velocidade_media_kmh = excluded.velocidade_media_kmh
        returning ${COLUNAS_CONFIG}`,
  )
  return r!
}

// ------------------------------------------------------------------------------- elegiveis

export interface ElegivelLinha {
  pedido_id: string
  codigo: string
  criado_em: string
  itens: number
  zona_nome: string | null
  endereco_id: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  lat: number | null
  lng: number | null
  geocode_falhou: boolean
}

/** Pedidos de entrega prontos para sair: sem corrida e sem motoboy atribuido (mesmo criterio do despacho). */
export const LIMITE_ELEGIVEIS = 50

export function elegiveis(ex: Executor, lojaId: string, ids: string[] | null) {
  return consultar<ElegivelLinha>(
    ex,
    sql`select p.id as pedido_id, p.codigo, ${TS('p.criado_em')} as criado_em,
               (select coalesce(sum(i.quantidade), 0)::int from public.itens_pedido i
                 where i.pedido_id = p.id and i.loja_id = p.loja_id and not i.cancelado) as itens,
               z.nome as zona_nome, e.id as endereco_id, e.logradouro, e.numero, e.bairro, e.cidade,
               e.uf::text as uf, e.cep, e.lat::float8 as lat, e.lng::float8 as lng,
               (e.id is not null and e.geocodificado_em is null and e.geocode_falha_em is not null) as geocode_falhou
          from public.pedidos p
          left join public.zonas_entrega z on z.id = p.zona_id and z.loja_id = p.loja_id
          left join public.enderecos e on e.id = p.endereco_id and e.loja_id = p.loja_id
         where p.loja_id = ${lojaId} and p.modalidade = 'entrega'
           and p.status in ('novo', 'em_preparo')
           and p.corrida_id is null and p.motoboy_id is null
           and (${ids}::uuid[] is null or p.id = any(${ids}::uuid[]))
         order by p.criado_em, p.id
         limit ${LIMITE_ELEGIVEIS}`,
  )
}

export interface PedidoTravado {
  id: string
  codigo: string
  status: 'rascunho' | 'novo' | 'em_preparo' | 'saiu_entrega' | 'entregue' | 'problema'
  modalidade: 'entrega' | 'retirada'
  corrida_id: string | null
  motoboy_id: string | null
}

/** Trava as linhas da loja (ordem por id evita deadlock entre dois aceites). */
export function travarPedidos(ex: Executor, lojaId: string, ids: string[]) {
  return consultar<PedidoTravado>(
    ex,
    sql`select id, codigo, status, modalidade, corrida_id, motoboy_id
          from public.pedidos
         where loja_id = ${lojaId} and id = any(${ids}::uuid[])
         order by id
           for update`,
  )
}

export interface PontoPedido {
  pedido_id: string
  lat: number | null
  lng: number | null
}

/** Coordenadas dos pedidos da loja (para reordenar uma lista manual). */
export function coordenadasDosPedidos(ex: Executor, lojaId: string, ids: string[]) {
  return consultar<PontoPedido>(
    ex,
    sql`select p.id as pedido_id, e.lat::float8 as lat, e.lng::float8 as lng
          from public.pedidos p
          left join public.enderecos e on e.id = p.endereco_id and e.loja_id = p.loja_id
         where p.loja_id = ${lojaId} and p.id = any(${ids}::uuid[])`,
  )
}

// ------------------------------------------------------------------------------- geocode

export interface EnderecoPendente {
  id: string
  logradouro: string
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}

/** Pendentes de geocode: sem coordenada e sem falha nas ultimas 24h; os de pedido aberto vem primeiro. */
export function enderecosPendentes(ex: Executor, lojaId: string, limite: number) {
  return consultar<EnderecoPendente>(
    ex,
    sql`select e.id, e.logradouro, e.numero, e.bairro, e.cidade, e.uf::text as uf, e.cep
          from public.enderecos e
         where e.loja_id = ${lojaId} and e.ativo and e.geocodificado_em is null
           and (e.geocode_falha_em is null or e.geocode_falha_em < now() - interval '24 hours')
         order by exists (select 1 from public.pedidos p
                           where p.endereco_id = e.id and p.loja_id = e.loja_id
                             and p.status in ('novo', 'em_preparo') and p.corrida_id is null) desc,
                  e.criado_em, e.id
         limit ${limite}`,
  )
}

export async function contarPendentes(ex: Executor, lojaId: string): Promise<number> {
  const r = await consultarUm<{ n: number }>(
    ex,
    sql`select count(*)::int as n from public.enderecos
         where loja_id = ${lojaId} and ativo and geocodificado_em is null
           and (geocode_falha_em is null or geocode_falha_em < now() - interval '24 hours')`,
  )
  return r?.n ?? 0
}

/** Unico ponto de escrita de lat/lng/geocodificado_em. So grava se ainda nao geocodificado. */
export async function gravarGeocode(ex: Executor, lojaId: string, id: string, lat: number, lng: number) {
  await consultar(
    ex,
    sql`update public.enderecos
           set lat = ${lat}, lng = ${lng}, geocodificado_em = now(), geocode_falha_em = null
         where id = ${id} and loja_id = ${lojaId}`,
  )
}

export async function marcarFalhaGeocode(ex: Executor, lojaId: string, id: string) {
  await consultar(
    ex,
    sql`update public.enderecos set geocode_falha_em = now()
         where id = ${id} and loja_id = ${lojaId} and geocodificado_em is null`,
  )
}

// ------------------------------------------------------------------------------- aceitar

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

export async function criarCorridaSugerida(ex: Executor, lojaId: string, motoboyId: string | null): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    ex,
    sql`insert into public.corridas (loja_id, motoboy_id, sugerida) values (${lojaId}, ${motoboyId}, true)
        returning id`,
  )
  return r!.id
}

/** Poe o pedido na corrida na parada indicada; a guarda `corrida_id is null` fecha a corrida entre aceites. */
export function entrarNaCorrida(
  ex: Executor, lojaId: string, pedidoId: string, corridaId: string, ordem: number,
  motoboy: { id: string; nome: string } | null,
) {
  const mid = motoboy?.id ?? null
  const mnome = motoboy?.nome ?? null
  return consultarUm<{ status: string }>(
    ex,
    sql`update public.pedidos
           set corrida_id = ${corridaId}, ordem_parada = ${ordem},
               motoboy_id = coalesce(${mid}::uuid, motoboy_id),
               motoboy_nome = case when ${mid}::uuid is null then motoboy_nome else ${mnome}::text end
         where id = ${pedidoId} and loja_id = ${lojaId} and corrida_id is null and motoboy_id is null
     returning status`,
  )
}

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

export function buscarCorrida(ex: Executor, lojaId: string, id: string) {
  return consultarUm<CorridaLinha>(
    ex,
    sql`select c.id, c.status, c.sugerida, c.motoboy_id, coalesce(pe.nome, m.nome) as motoboy_nome,
               ${TS('c.despachada_em')} as despachada_em, ${TS('c.concluida_em')} as concluida_em,
               ${TS('c.criado_em')} as criado_em
          from public.corridas c
          left join public.motoboys m on m.id = c.motoboy_id
          left join public.pessoas pe on pe.id = m.pessoa_id
         where c.id = ${id} and c.loja_id = ${lojaId}`,
  )
}

export interface ParadaLinha {
  pedido_id: string
  codigo: string
  status: string
  ordem_parada: number | null
  total_centavos: number
  zona_id: string | null
  zona_nome: string | null
  valor_motoboy_centavos: number
  endereco_resumo: string | null
  bairro: string | null
  lat: number | null
  lng: number | null
}

export function paradasDaCorrida(ex: Executor, lojaId: string, corridaId: string) {
  return consultar<ParadaLinha>(
    ex,
    sql`select p.id as pedido_id, p.codigo, p.status, p.ordem_parada, p.total_centavos, p.zona_id,
               z.nome as zona_nome, coalesce(z.valor_motoboy_centavos, 0)::int as valor_motoboy_centavos,
               nullif(concat_ws(', ', e.logradouro, e.numero), '') as endereco_resumo, e.bairro,
               e.lat::float8 as lat, e.lng::float8 as lng
          from public.pedidos p
          left join public.zonas_entrega z on z.id = p.zona_id and z.loja_id = p.loja_id
          left join public.enderecos e on e.id = p.endereco_id and e.loja_id = p.loja_id
         where p.loja_id = ${lojaId} and p.corrida_id = ${corridaId}
         order by p.ordem_parada, p.id`,
  )
}

// ------------------------------------------------------------------------------- auditoria

/** Auditoria sem PII (tabela eventos). `detalhes` so com ids, contagens e codigos. */
export async function registrarEvento(
  ex: Executor,
  e: {
    lojaId: string
    tipo: string
    entidade: 'endereco' | 'corrida'
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
