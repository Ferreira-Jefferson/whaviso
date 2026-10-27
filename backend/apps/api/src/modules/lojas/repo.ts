// SQL parametrizado do modulo (SEC-080). Dono de escrita de `lojas`.
// Leituras cruzadas (documentadas no MODULE.md): numeros_whatsapp (so contagem) e membros
// (so para achar a conta do dono, pois o kernel de escopo exclui lojas inativas e conta sem loja).
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { Cores, Endereco, Horarios, AreaEntrega } from './schemas'

export interface LojaLinha {
  id: string
  conta_id: string
  nome: string
  logo_url: string | null
  cores: Cores
  endereco: Endereco | null
  horarios: Horarios | null
  area_entrega: AreaEntrega | null
  ativo: boolean
  criado_em: Date
  atualizado_em: Date
  numeros_total: number
  numeros_conectados: number
}

const COLUNAS = sql`
  l.id, l.conta_id, l.nome, l.logo_url, l.cores, l.endereco, l.horarios, l.area_entrega,
  l.ativo, l.criado_em, l.atualizado_em,
  coalesce(n.total, 0)::int as numeros_total, coalesce(n.conectados, 0)::int as numeros_conectados
  from public.lojas l
  left join lateral (
    select count(*) as total, count(*) filter (where status = 'conectado') as conectados
      from public.numeros_whatsapp w where w.loja_id = l.id and w.status <> 'removido'
  ) n on true`

/** Lojas do escopo (ids vindos do kernel) + inativas da conta quando `contaInativas` informada. */
export function listar(ex: Executor, lojaIds: string[], contaInativas: string | null) {
  return consultar<LojaLinha>(
    ex,
    sql`select ${COLUNAS}
         where l.id = any(${lojaIds}::uuid[])
            or (${contaInativas}::uuid is not null and l.conta_id = ${contaInativas}::uuid and not l.ativo)
         order by l.nome, l.id`,
  )
}

export function buscar(ex: Executor, id: string, contaId: string) {
  return consultarUm<LojaLinha>(
    ex,
    sql`select ${COLUNAS} where l.id = ${id} and l.conta_id = ${contaId}`,
  )
}

/** Contas em que o usuario e dono de TODAS as lojas (membro dono ativo com loja_id nulo). */
export async function contasDoDono(ex: Executor, userId: string): Promise<string[]> {
  const rows = await consultar<{ conta_id: string }>(
    ex,
    sql`select distinct conta_id from public.membros
         where user_id = ${userId} and ativo and papel = 'dono' and loja_id is null`,
  )
  return rows.map((r) => r.conta_id)
}

const json = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v))

export interface NovaLoja {
  nome: string
  endereco?: Endereco | undefined
  horarios: Horarios
  area_entrega?: AreaEntrega | undefined
}

export async function inserir(ex: Executor, contaId: string, n: NovaLoja): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    ex,
    sql`insert into public.lojas (conta_id, nome, endereco, horarios, area_entrega)
        values (${contaId}, ${n.nome}, ${json(n.endereco)}::jsonb, ${json(n.horarios)}::jsonb,
                ${json(n.area_entrega)}::jsonb)
        returning id`,
  )
  return r!.id
}

export interface Parcial {
  nome?: string | undefined
  endereco?: Endereco | null | undefined
  horarios?: Horarios | null | undefined
  area_entrega?: AreaEntrega | null | undefined
  cores?: Cores | undefined
  logo_url?: string | null | undefined
}

/** Atualiza so os campos presentes (undefined = manter; null = limpar). Escopada por conta. */
export async function atualizar(ex: Executor, id: string, contaId: string, p: Parcial) {
  const tem = (k: keyof Parcial) => p[k] !== undefined
  await consultar(
    ex,
    sql`update public.lojas set
          nome = case when ${tem('nome')}::boolean then ${p.nome ?? null} else nome end,
          endereco = case when ${tem('endereco')}::boolean then ${json(p.endereco)}::jsonb else endereco end,
          horarios = case when ${tem('horarios')}::boolean then ${json(p.horarios)}::jsonb else horarios end,
          area_entrega = case when ${tem('area_entrega')}::boolean then ${json(p.area_entrega)}::jsonb else area_entrega end,
          cores = case when ${tem('cores')}::boolean then ${json(p.cores) ?? '{}'}::jsonb else cores end,
          logo_url = case when ${tem('logo_url')}::boolean then ${p.logo_url ?? null} else logo_url end
        where id = ${id} and conta_id = ${contaId}`,
  )
}

export async function definirAtivo(ex: Executor, id: string, contaId: string, ativo: boolean) {
  await consultar(
    ex,
    sql`update public.lojas set ativo = ${ativo} where id = ${id} and conta_id = ${contaId}`,
  )
}

/** Trava as lojas ativas da conta (serializa desativacoes concorrentes) e devolve os ids. */
export async function travarAtivas(ex: Executor, contaId: string): Promise<string[]> {
  const rows = await consultar<{ id: string }>(
    ex,
    sql`select id from public.lojas where conta_id = ${contaId} and ativo order by id for update`,
  )
  return rows.map((r) => r.id)
}

/** Auditoria sem PII: so o tipo e os NOMES dos campos alterados. */
export async function registrarEvento(
  ex: Executor,
  lojaId: string,
  tipo: 'loja.criada' | 'loja.atualizada' | 'loja.desativada' | 'loja.reativada',
  campos: string[],
) {
  await consultar(
    ex,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${lojaId}, ${tipo}, 'loja', ${lojaId}, 'loja', ${JSON.stringify({ campos })}::jsonb)`,
  )
}
