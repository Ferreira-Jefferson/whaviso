// Leitura e escrita do modulo: SO via @whaviso/shared/db, sempre sql`...` parametrizado (SEC-080).
// Tudo filtra/carimba loja_id da loja ativa (nunca do corpo). Sem DELETE: zona sai com ativo=false.
// Leitura cruzada documentada no MODULE.md: `pedidos` (so count de pedidos em aberto por zona).
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface ZonaLinha {
  id: string
  nome: string
  tipo: 'bairro' | 'poligono' | 'raio'
  bairro: string | null
  area: unknown
  taxa_cliente_centavos: number
  valor_motoboy_centavos: number
  pedido_minimo_centavos: number | null
  frete_gratis_acima_centavos: number | null
  ativo: boolean
  pedidos_em_aberto: number
  criado_em: string
  atualizado_em: string
}

const COLUNAS = sql`
  z.id, z.nome, z.tipo, z.bairro, z.area, z.taxa_cliente_centavos, z.valor_motoboy_centavos,
  z.pedido_minimo_centavos, z.frete_gratis_acima_centavos, z.ativo,
  (select count(*)::int from public.pedidos p
    where p.zona_id = z.id and p.loja_id = z.loja_id
      and p.status in ('novo', 'em_preparo', 'saiu_entrega')) as pedidos_em_aberto,
  ${TS('z.criado_em')} as criado_em, ${TS('z.atualizado_em')} as atualizado_em`

export function listar(ex: Executor, lojaId: string, incluirInativas: boolean) {
  return consultar<ZonaLinha>(
    ex,
    sql`select ${COLUNAS} from public.zonas_entrega z
         where z.loja_id = ${lojaId} and (${incluirInativas}::boolean or z.ativo)
         order by z.ativo desc, z.nome, z.id`,
  )
}

export function buscar(ex: Executor, lojaId: string, id: string) {
  return consultarUm<ZonaLinha>(
    ex,
    sql`select ${COLUNAS} from public.zonas_entrega z where z.id = ${id} and z.loja_id = ${lojaId}`,
  )
}

/** Zonas ativas, mais antigas primeiro (base do desempate do resolver). */
export function listarAtivas(ex: Executor, lojaId: string) {
  // Sem o count de pedidos em aberto (caro, e o resolver nao le): vem 0 so para manter o tipo.
  return consultar<ZonaLinha>(
    ex,
    sql`select z.id, z.nome, z.tipo, z.bairro, z.area, z.taxa_cliente_centavos, z.valor_motoboy_centavos,
                z.pedido_minimo_centavos, z.frete_gratis_acima_centavos, z.ativo,
                0::int as pedidos_em_aberto,
                ${TS('z.criado_em')} as criado_em, ${TS('z.atualizado_em')} as atualizado_em
           from public.zonas_entrega z
          where z.loja_id = ${lojaId} and z.ativo
          order by z.criado_em, z.id`,
  )
}

/** Serializa escritas de zona por loja (unicidade logica de bairro checada no service). */
export async function travarLoja(ex: Executor, lojaId: string): Promise<void> {
  await consultar(ex, sql`select pg_advisory_xact_lock(hashtext(${'zonas:' + lojaId}))`)
}

/** Bairros das zonas ATIVAS de tipo bairro (id + texto), para checar duplicata. */
export function bairrosAtivos(ex: Executor, lojaId: string) {
  return consultar<{ id: string; bairro: string }>(
    ex,
    sql`select id, bairro from public.zonas_entrega
         where loja_id = ${lojaId} and ativo and tipo = 'bairro' and bairro is not null`,
  )
}

export interface NovaZona {
  nome: string
  tipo: 'bairro' | 'poligono' | 'raio'
  bairro: string | null
  area: unknown
  taxa_cliente_centavos: number
  valor_motoboy_centavos: number
  pedido_minimo_centavos: number | null
  frete_gratis_acima_centavos: number | null
}

export async function inserir(ex: Executor, lojaId: string, n: NovaZona): Promise<string> {
  const area = n.area === null ? null : JSON.stringify(n.area)
  const r = await consultarUm<{ id: string }>(
    ex,
    sql`insert into public.zonas_entrega
          (loja_id, nome, tipo, bairro, area, taxa_cliente_centavos, valor_motoboy_centavos,
           pedido_minimo_centavos, frete_gratis_acima_centavos)
        values (${lojaId}, ${n.nome}, ${n.tipo}::tipo_zona, ${n.bairro}, ${area}::jsonb,
                ${n.taxa_cliente_centavos}, ${n.valor_motoboy_centavos},
                ${n.pedido_minimo_centavos}, ${n.frete_gratis_acima_centavos})
        returning id`,
  )
  return r!.id
}

export interface ParcialZona {
  nome?: string | undefined
  bairro?: string | undefined
  area?: unknown
  taxa_cliente_centavos?: number | undefined
  valor_motoboy_centavos?: number | undefined
  pedido_minimo_centavos?: number | null | undefined
  frete_gratis_acima_centavos?: number | null | undefined
}

function juntar(partes: Consulta[]): Consulta {
  return partes.reduce((acc, parte, i) => (i === 0 ? parte : sql`${acc}, ${parte}`))
}

/** Atualiza so os campos presentes (undefined = manter; null = limpar, onde permitido). */
export async function atualizar(ex: Executor, lojaId: string, id: string, p: ParcialZona) {
  const partes: Consulta[] = []
  if (p.nome !== undefined) partes.push(sql`nome = ${p.nome}`)
  if (p.bairro !== undefined) partes.push(sql`bairro = ${p.bairro}`)
  if (p.area !== undefined) partes.push(sql`area = ${JSON.stringify(p.area)}::jsonb`)
  if (p.taxa_cliente_centavos !== undefined) partes.push(sql`taxa_cliente_centavos = ${p.taxa_cliente_centavos}`)
  if (p.valor_motoboy_centavos !== undefined) partes.push(sql`valor_motoboy_centavos = ${p.valor_motoboy_centavos}`)
  if (p.pedido_minimo_centavos !== undefined) partes.push(sql`pedido_minimo_centavos = ${p.pedido_minimo_centavos}`)
  if (p.frete_gratis_acima_centavos !== undefined) {
    partes.push(sql`frete_gratis_acima_centavos = ${p.frete_gratis_acima_centavos}`)
  }
  if (partes.length === 0) return false
  const r = await consultarUm<{ id: string }>(
    ex,
    sql`update public.zonas_entrega set ${juntar(partes)}
         where id = ${id} and loja_id = ${lojaId} returning id`,
  )
  return r !== null
}

export async function definirAtivo(ex: Executor, lojaId: string, id: string, ativo: boolean) {
  await consultar(
    ex,
    sql`update public.zonas_entrega set ativo = ${ativo} where id = ${id} and loja_id = ${lojaId}`,
  )
}

/** Auditoria sem PII (tabela eventos). `detalhes` so com ids, user_id e nomes de campos. */
export async function registrarEvento(
  ex: Executor,
  e: { lojaId: string; tipo: string; zonaId: string; detalhes: Record<string, unknown> },
) {
  await consultar(
    ex,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'zona', ${e.zonaId}, 'loja', ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
