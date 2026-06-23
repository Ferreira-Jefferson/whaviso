import pg from 'pg'

export type Pool = pg.Pool
export type PoolClient = pg.PoolClient

export interface OpcoesPool {
  connectionString: string
  /** api usa 5; zap usa 3 (pooler Supavisor tem limite de conexões no Free) */
  max: number
}

export function criarPool(opcoes: OpcoesPool): Pool {
  return new pg.Pool({
    connectionString: opcoes.connectionString,
    max: opcoes.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
}

/** Executa fn dentro de BEGIN/COMMIT, com ROLLBACK em qualquer erro. */
export async function comTransacao<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const resultado = await fn(client)
    await client.query('commit')
    return resultado
  } catch (erro) {
    await client.query('rollback').catch(() => {})
    throw erro
  } finally {
    client.release()
  }
}
