// Fronteira UNICA de dados (SEC-080): so `pg`, SQL padrao, banco trocavel por connection
// string. Nada de @supabase/* aqui nem em modulos (Supabase = Auth/JWKS apenas).
import pg from 'pg'
import type { z } from 'zod'
import { ehConsulta, type Consulta } from './sql'
import { traduzirErroPg } from './erros'

export { sql, sqlBruto, ehConsulta, type Consulta } from './sql'
export { ErroBanco, traduzirErroPg, type TipoErroBanco } from './erros'

export type Pool = pg.Pool
export type PoolClient = pg.PoolClient
/** Qualquer coisa que execute query: pool ou cliente dentro de transacao. */
export type Executor = Pick<pg.Pool | pg.PoolClient, 'query'>

export interface OpcoesPool {
  connectionString: string
  /** api usa 5; zap usa 3 (pooler Supavisor tem limite de conexoes no Free) */
  max: number
  connectTimeoutMs?: number
  idleTimeoutMs?: number
  /** statement_timeout por conexao (ms); 0 = sem limite. */
  statementTimeoutMs?: number
}

export function criarPool(opcoes: OpcoesPool): Pool {
  return new pg.Pool({
    connectionString: opcoes.connectionString,
    max: opcoes.max,
    idleTimeoutMillis: opcoes.idleTimeoutMs ?? 30_000,
    connectionTimeoutMillis: opcoes.connectTimeoutMs ?? 10_000,
    statement_timeout: opcoes.statementTimeoutMs ?? 15_000,
  })
}

/**
 * Executa uma Consulta parametrizada e devolve as linhas (opcionalmente validadas por Zod).
 * Erros do pg sao traduzidos para `ErroBanco` (unique/fk/check...), sem vazar detalhe.
 * Texto cru so entra via `sql` / `sqlBruto`.
 */
export async function consultar<T = Record<string, unknown>>(
  exec: Executor,
  consulta: Consulta,
  opcoes?: { linha?: z.ZodType<T> },
): Promise<T[]> {
  if (!ehConsulta(consulta)) {
    throw new TypeError('consultar exige uma Consulta montada por sql (template tag)')
  }
  try {
    const { rows } = await exec.query(consulta.text, [...consulta.values])
    const schema = opcoes?.linha
    return schema ? rows.map((r) => schema.parse(r)) : (rows as T[])
  } catch (erro) {
    throw traduzirErroPg(erro) ?? erro
  }
}

/** Primeira linha ou null. */
export async function consultarUm<T = Record<string, unknown>>(
  exec: Executor,
  consulta: Consulta,
  opcoes?: { linha?: z.ZodType<T> },
): Promise<T | null> {
  return (await consultar<T>(exec, consulta, opcoes))[0] ?? null
}

export interface OpcoesTransacao {
  /** Gancho apos BEGIN (ex.: `set_config(..., true)` para RLS por GUC). */
  aoIniciar?: (client: PoolClient) => Promise<void>
}

/** Executa fn dentro de BEGIN/COMMIT, com ROLLBACK em qualquer erro. */
export async function comTransacao<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
  opcoes?: OpcoesTransacao,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    if (opcoes?.aoIniciar) await opcoes.aoIniciar(client)
    const resultado = await fn(client)
    await client.query('commit')
    return resultado
  } catch (erro) {
    await client.query('rollback').catch(() => {})
    throw traduzirErroPg(erro) ?? erro
  } finally {
    client.release()
  }
}

/** Alias semantico de `comTransacao`. */
export const transacao = comTransacao
