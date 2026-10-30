// Acesso a dados do modulo acessos_login: SO via @whaviso/shared/db, sempre com sql`...`
// (parametrizado; SEC-080). Dono de escrita de `acessos_permitidos` no fluxo do operador
// (listar/adicionar/aprovar/revogar). Sem DELETE (negocio: revogar e mudanca de status).
// Datas: timestamptz -> ISO UTC. O e-mail e dado da allowlist (vai no DTO ao operador), nunca em log.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { AcessoStatus } from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface AcessoLinha {
  id: string
  email: string
  status: AcessoStatus
  origem: 'pagamento' | 'admin'
  conta_id: string | null
  observacao: string | null
  aprovado_em: string | null
  boas_vindas_enviado_em: string | null
  criado_em: string
  atualizado_em: string
}

const SAIDA = sql`
  id, email, status, origem, conta_id, observacao,
  ${TS('aprovado_em')} as aprovado_em, ${TS('boas_vindas_enviado_em')} as boas_vindas_enviado_em,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

/**
 * Resolve o e-mail do usuario autenticado via a funcao `plataforma_auth_info` (mesma fonte que o
 * gate de bootstrap do modulo `conta`). Null se o usuario nao existir no Auth. O e-mail nunca vai a log.
 */
export async function emailDoUsuario(exec: Executor, userId: string): Promise<string | null> {
  const r = await consultarUm<{ email: string }>(
    exec,
    sql`select email from public.plataforma_auth_info(array[${userId}]::uuid[]) limit 1`,
  )
  return r?.email ?? null
}

/** Status da allowlist para um e-mail (case-insensitive). Null quando o e-mail nao esta cadastrado. */
export async function statusDoEmail(exec: Executor, email: string): Promise<AcessoStatus | null> {
  const r = await consultarUm<{ status: AcessoStatus }>(
    exec,
    sql`select status from public.acessos_permitidos where lower(email) = lower(${email}) limit 1`,
  )
  return r?.status ?? null
}

export async function listar(exec: Executor, status?: AcessoStatus): Promise<AcessoLinha[]> {
  const s = status ?? null
  return consultar<AcessoLinha>(
    exec,
    sql`select ${SAIDA} from public.acessos_permitidos
         where (${s}::acesso_status is null or status = ${s}::acesso_status)
         order by criado_em desc, id
         limit 200`,
  )
}

export async function obter(exec: Executor, id: string): Promise<AcessoLinha | null> {
  return consultarUm<AcessoLinha>(
    exec,
    sql`select ${SAIDA} from public.acessos_permitidos where id = ${id}`,
  )
}

/** Insere um e-mail novo (status pendente, origem admin). Viola indice unico (23505) se ja existe. */
export async function inserir(
  exec: Executor,
  d: { email: string; observacao: string | null; criadoPor: string },
): Promise<AcessoLinha | null> {
  return consultarUm<AcessoLinha>(
    exec,
    sql`insert into public.acessos_permitidos (email, observacao, origem, criado_por)
        values (${d.email}, ${d.observacao}, 'admin', ${d.criadoPor})
        returning ${SAIDA}`,
  )
}

/**
 * Aprova um acesso pelo id: status -> aprovado, carimba aprovado_por/aprovado_em. Devolve a linha
 * (com boas_vindas_enviado_em atual, para o service decidir se enfileira o boas-vindas). Idempotente:
 * aprovar quem ja esta aprovado mantem o aprovado_em original.
 */
export async function aprovar(
  exec: Executor,
  id: string,
  operadorUserId: string,
): Promise<AcessoLinha | null> {
  return consultarUm<AcessoLinha>(
    exec,
    sql`update public.acessos_permitidos set
          status = 'aprovado',
          aprovado_por = coalesce(aprovado_por, ${operadorUserId}),
          aprovado_em = coalesce(aprovado_em, now())
        where id = ${id}
        returning ${SAIDA}`,
  )
}

/** Marca o boas-vindas como tratado (enfileirado) para nao reenfileirar em futuras aprovacoes. */
export async function marcarBoasVindas(exec: Executor, id: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.acessos_permitidos set boas_vindas_enviado_em = now()
         where id = ${id} and boas_vindas_enviado_em is null`,
  )
}

/**
 * Revoga um acesso (status -> revogado). Limpa `aprovado_em` por coerencia com a check
 * `acessos_permitidos_aprovado_coerente` (aprovado_em so com status 'aprovado').
 */
export async function revogar(exec: Executor, id: string): Promise<AcessoLinha | null> {
  return consultarUm<AcessoLinha>(
    exec,
    sql`update public.acessos_permitidos set status = 'revogado', aprovado_em = null
         where id = ${id} returning ${SAIDA}`,
  )
}
