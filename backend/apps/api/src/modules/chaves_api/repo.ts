// Persistencia de chaves_api. So INSERT/UPDATE (sem DELETE, SEC-030). Colunas explicitas.
import { consultar, consultarUm, sql, sqlBruto, type Executor } from '@whaviso/shared/db'

export interface ChaveLinha {
  id: string
  nome: string
  prefixo: string
  ultimos4: string
  criado_em: string
  expira_em: string | null
  revogada_em: string | null
  /** calculada no banco (now()), para nao depender do relogio do node */
  expirada: boolean
}

const ISO = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
const COLS = sqlBruto(`id, nome, prefixo, ultimos4,
  ${ISO('criado_em')} as criado_em,
  ${ISO('expira_em')} as expira_em,
  ${ISO('revogada_em')} as revogada_em,
  (expira_em is not null and expira_em <= now()) as expirada`)

export async function contaExiste(exec: Executor, contaId: string): Promise<boolean> {
  const r = await consultarUm<{ id: string }>(exec, sql`select id from public.contas where id = ${contaId}`)
  return r !== null
}

export async function listar(exec: Executor, contaId: string): Promise<ChaveLinha[]> {
  return consultar<ChaveLinha>(
    exec,
    sql`select ${COLS} from public.chaves_api where conta_id = ${contaId} order by criado_em desc, id`,
  )
}

export async function inserir(
  exec: Executor,
  d: { contaId: string; nome: string; prefixo: string; ultimos4: string; hash: string; expiraEm: string | null },
): Promise<ChaveLinha> {
  const r = await consultarUm<ChaveLinha>(
    exec,
    sql`insert into public.chaves_api (conta_id, nome, prefixo, ultimos4, hash_sha256, expira_em)
        values (${d.contaId}, ${d.nome}, ${d.prefixo}, ${d.ultimos4}, ${d.hash}, ${d.expiraEm}::timestamptz)
        returning ${COLS}`,
  )
  if (!r) throw new Error('insert de chave sem retorno')
  return r
}

/** Revogacao SOFT (idempotente: mantem a data da primeira revogacao). null = nao existe nesta conta. */
export async function revogar(exec: Executor, contaId: string, id: string): Promise<ChaveLinha | null> {
  await consultar(
    exec,
    sql`update public.chaves_api set revogada_em = now()
         where id = ${id} and conta_id = ${contaId} and revogada_em is null`,
  )
  return consultarUm<ChaveLinha>(
    exec,
    sql`select ${COLS} from public.chaves_api where id = ${id} and conta_id = ${contaId}`,
  )
}

/** Auditoria (append-only). `detalhes` so com ids; nunca o segredo. Evento global (sem loja). */
export async function registrarEvento(
  exec: Executor,
  e: { tipo: string; chaveId: string; detalhes: Record<string, unknown> },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (null, ${e.tipo}, 'chave_api', ${e.chaveId}, 'operador', ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
