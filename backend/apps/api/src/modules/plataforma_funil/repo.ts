// Leitura do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado). Nunca
// seleciona telefone em claro: so o cifrado (o service mascara ou decifra no detalhe).
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { EstagioProspecto, TipoAtividadeProspecto } from '@whaviso/shared/contracts'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface ProspectoLinha {
  id: string
  nome_restaurante: string
  contato_nome: string | null
  contato_telefone_cifrado: Buffer | null
  contato_email: string | null
  cidade: string | null
  origem: string | null
  estagio: EstagioProspecto
  responsavel_operador_id: string | null
  responsavel_nome: string | null
  conta_id: string | null
  conta_nome: string | null
  observacoes: string | null
  criado_em: string
  atualizado_em: string
}

export interface AtividadeLinha {
  id: string // bigint vem como texto
  prospecto_id: string
  operador_id: string | null
  operador_nome: string | null
  tipo: TipoAtividadeProspecto
  descricao: string | null
  agendada_para: string | null
  criado_em: string
}

export interface AgendaLinha {
  atividade_id: string
  prospecto_id: string
  nome_restaurante: string
  estagio: EstagioProspecto
  responsavel_operador_id: string | null
  descricao: string | null
  agendada_para: string
  atrasado: boolean
}

export const COLS_PROSPECTO = sql`p.id, p.nome_restaurante, p.contato_nome, p.contato_telefone_cifrado,
  p.contato_email, p.cidade, p.origem, p.estagio, p.responsavel_operador_id,
  o.nome as responsavel_nome, p.conta_id, c.nome as conta_nome, p.observacoes,
  ${TS('p.criado_em')} as criado_em, ${TS('p.atualizado_em')} as atualizado_em`

export const FROM_PROSPECTO = sql`public.prospectos p
  left join public.operadores o on o.id = p.responsavel_operador_id
  left join public.contas c on c.id = p.conta_id`

/** Operador ativo pelo user_id do JWT (o ator nunca vem do corpo). */
export async function operadorAtivoPorUsuario(exec: Executor, userId: string) {
  return consultarUm<{ id: string }>(
    exec,
    sql`select id from public.operadores where user_id = ${userId} and ativo`,
  )
}

export async function operadorAtivoPorId(exec: Executor, id: string) {
  return consultarUm<{ id: string }>(exec, sql`select id from public.operadores where id = ${id} and ativo`)
}

export async function obterProspecto(exec: Executor, id: string) {
  return consultarUm<ProspectoLinha>(
    exec,
    sql`select ${COLS_PROSPECTO} from ${FROM_PROSPECTO} where p.id = ${id}`,
  )
}

/** Trava a linha do prospecto na transacao e devolve o estagio atual. */
export async function travarProspecto(exec: Executor, id: string) {
  return consultarUm<{ id: string; estagio: EstagioProspecto }>(
    exec,
    sql`select id, estagio from public.prospectos where id = ${id} for update`,
  )
}

/** Id de prospecto que ja usa este hash de telefone (excluindo opcionalmente um id). */
export async function prospectoPorHash(exec: Executor, hash: string, exceto?: string) {
  const filtro = exceto ? sql` and id <> ${exceto}` : sqlBruto('')
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`select id from public.prospectos where contato_telefone_hash = ${hash}${filtro} limit 1`,
  )
  return r?.id ?? null
}

export interface FiltrosLista {
  estagio?: EstagioProspecto
  responsavelId?: string
  cidade?: string
  q?: string
  apos?: { t: string; id: string }
  limite: number
}

function juntarE(partes: Consulta[]): Consulta {
  return partes.reduce((acc, parte, i) => (i === 0 ? parte : sql`${acc} and ${parte}`))
}

/** Pagina por keyset (atualizado_em desc, id desc). Busca limite+1 para saber se ha proxima. */
export async function listarProspectos(exec: Executor, f: FiltrosLista) {
  const cond: Consulta[] = [sqlBruto('true')]
  if (f.estagio) cond.push(sql`p.estagio = ${f.estagio}`)
  if (f.responsavelId) cond.push(sql`p.responsavel_operador_id = ${f.responsavelId}`)
  if (f.cidade) cond.push(sql`lower(p.cidade) = lower(${f.cidade})`)
  if (f.q) {
    // Escapa curingas do LIKE (a entrada e dado, nunca padrao).
    const padrao = `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    cond.push(sql`p.nome_restaurante ilike ${padrao}`)
  }
  if (f.apos) cond.push(sql`(p.atualizado_em, p.id) < (${f.apos.t}::timestamptz, ${f.apos.id}::uuid)`)
  return consultar<ProspectoLinha & { cursor_t: string }>(
    exec,
    sql`select ${COLS_PROSPECTO}, ${TS('p.atualizado_em')} as cursor_t
          from ${FROM_PROSPECTO}
         where ${juntarE(cond)}
         order by p.atualizado_em desc, p.id desc
         limit ${f.limite + 1}`,
  )
}

/** Quadro: total por estagio + top N itens por estagio, numa unica query (window functions). */
export async function quadro(exec: Executor, limitePorEstagio: number) {
  return consultar<ProspectoLinha & { total: number }>(
    exec,
    sql`select * from (
          select ${COLS_PROSPECTO},
                 count(*) over (partition by p.estagio)::int as total,
                 row_number() over (partition by p.estagio order by p.atualizado_em desc, p.id desc) as rn
            from ${FROM_PROSPECTO}
        ) t
         where t.rn <= ${limitePorEstagio}
         order by t.estagio, t.rn`,
  )
}

/** Timeline de atividades do prospecto, mais recentes primeiro (keyset por criado_em, id). */
export async function atividadesDoProspecto(
  exec: Executor,
  prospectoId: string,
  apos: { t: string; id: string } | undefined,
  limite: number,
) {
  const filtro = apos
    ? sql` and (a.criado_em, a.id) < (${apos.t}::timestamptz, ${apos.id}::bigint)`
    : sqlBruto('')
  return consultar<AtividadeLinha & { cursor_t: string }>(
    exec,
    sql`select a.id::text as id, a.prospecto_id, a.operador_id, o.nome as operador_nome, a.tipo,
               a.descricao, ${TS('a.agendada_para')} as agendada_para,
               ${TS('a.criado_em')} as criado_em, ${TS('a.criado_em')} as cursor_t
          from public.prospecto_atividades a
          left join public.operadores o on o.id = a.operador_id
         where a.prospecto_id = ${prospectoId}${filtro}
         order by a.criado_em desc, a.id desc
         limit ${limite + 1}`,
  )
}

export async function obterAtividade(exec: Executor, prospectoId: string, id: number) {
  return consultarUm<{ id: string; tipo: TipoAtividadeProspecto; agendada_para: string | null }>(
    exec,
    sql`select id::text as id, tipo, agendada_para::text as agendada_para
          from public.prospecto_atividades where id = ${id} and prospecto_id = ${prospectoId}`,
  )
}

/** Ja existe atividade que conclui este follow-up? (marca estruturada na descricao). */
export async function followUpConcluido(exec: Executor, prospectoId: string, atividadeId: number) {
  const r = await consultarUm<{ ok: boolean }>(
    exec,
    sql`select exists (
          select 1 from public.prospecto_atividades c
           where c.prospecto_id = ${prospectoId}
             and substring(c.descricao from '^\\{"conclui":([0-9]+)') = ${String(atividadeId)}
        ) as ok`,
  )
  return r?.ok === true
}

/**
 * Agenda: follow-ups com agendada_para ate `limite` (inclui atrasados), sem conclusao posterior.
 * Responsavel efetivo = responsavel do prospecto, ou quem agendou se o prospecto nao tem dono.
 */
export async function agenda(exec: Executor, d: { limite: Date; responsavelId: string | null }) {
  const filtroResp = d.responsavelId
    ? sql` and coalesce(p.responsavel_operador_id, a.operador_id) = ${d.responsavelId}`
    : sqlBruto('')
  return consultar<AgendaLinha>(
    exec,
    sql`select a.id::text as atividade_id, a.prospecto_id, p.nome_restaurante, p.estagio,
               p.responsavel_operador_id, a.descricao, ${TS('a.agendada_para')} as agendada_para,
               (a.agendada_para < now()) as atrasado
          from public.prospecto_atividades a
          join public.prospectos p on p.id = a.prospecto_id
         where a.tipo = 'follow_up'
           and a.agendada_para is not null
           and a.agendada_para <= ${d.limite}
           and not exists (
             select 1 from public.prospecto_atividades c
              where c.prospecto_id = a.prospecto_id
                and substring(c.descricao from '^\\{"conclui":([0-9]+)') = a.id::text
           )${filtroResp}
         order by a.agendada_para, a.id`,
  )
}

/** Conta existe? (leitura simples; o modulo nao escreve em contas). */
export async function contaExiste(exec: Executor, id: string) {
  return (await consultarUm<{ id: string }>(exec, sql`select id from public.contas where id = ${id}`)) !== null
}

/** Outro prospecto ja vinculado a esta conta? */
export async function prospectoDaConta(exec: Executor, contaId: string) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`select id from public.prospectos where conta_id = ${contaId} limit 1`,
  )
  return r?.id ?? null
}
