// Transacao sobre um Executor generico. Pool => abre BEGIN/COMMIT proprio; PoolClient (tem `release`)
// => o chamador ja controla a transacao, entao so executa.
import { comTransacao, consultar, sql, type Executor, type Pool } from '@whaviso/shared/db'

export function comTx<T>(exec: Executor, fn: (tx: Executor) => Promise<T>): Promise<T> {
  const e = exec as unknown as Record<string, unknown>
  if (typeof e.connect === 'function' && !('release' in e)) return comTransacao(exec as unknown as Pool, fn)
  return fn(exec)
}

/**
 * Roda a busca vetorial na MESMA transacao com `hnsw.iterative_scan = relaxed_order` (pgvector 0.8+),
 * que melhora o recall quando o filtro por loja vem depois do indice HNSW global. Tolerante: se o GUC
 * nao existe no ambiente (pgvector antigo) ou nao ha transacao, o savepoint desfaz e a query segue igual.
 */
export function comBuscaVetorial<T>(exec: Executor, fn: (tx: Executor) => Promise<T>): Promise<T> {
  return comTx(exec, async (tx) => {
    try {
      await consultar(tx, sql`savepoint hnsw_iter`)
      await consultar(tx, sql`set local hnsw.iterative_scan = relaxed_order`)
      await consultar(tx, sql`release savepoint hnsw_iter`)
    } catch {
      await consultar(tx, sql`rollback to savepoint hnsw_iter`).catch(() => undefined)
    }
    return fn(tx)
  })
}
