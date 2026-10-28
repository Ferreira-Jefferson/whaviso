// setupFiles do vitest: roda em cada worker ANTES dos arquivos de teste. Fixa, em
// PGDATABASE, o banco clonado deste worker (base_<escopo>_w<id>), para que qualquer harness
// aponte para o clone isolado, seja o novo (criarPool) seja o legado (process.env.PGDATABASE).
// Idempotente entre os arquivos do mesmo worker: congela a base em PGDATABASE_BASE.
import { nomeBancoWorker } from './banco'

process.env.PGDATABASE_BASE ??= process.env.PGDATABASE ?? 'whaviso_dev'
const id = process.env.VITEST_POOL_ID
if (id) process.env.PGDATABASE = nomeBancoWorker(id)

export {}
