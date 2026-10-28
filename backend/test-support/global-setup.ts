// globalSetup do vitest (roda uma vez, no processo principal, antes dos workers).
// Cria um clone do banco de teste por worker (base_w1..w<N>) a partir do template base.
// Clonar via TEMPLATE e uma copia de arquivos no Postgres: barato perto do custo de
// recriar schema+seed. N = VITEST_MAX_FORKS (default 4) e casa com maxForks da config.
//
// Degradacao suave: se o Postgres local nao responder, apenas avisa e segue. Sem os
// clones, os harnesses nao conectam e as suites de DB se pulam (como ja ocorre sem banco).
import pg from 'pg'
import { HOST, PORTA, SENHA_SUPER, NUM_WORKERS as N, bancoBase, nomeBancoWorker } from './banco'

async function terminarConexoes(admin: pg.Client, db: string): Promise<void> {
  await admin.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [db],
  )
}

export default async function preparar(): Promise<void> {
  const base = bancoBase()
  const admin = new pg.Client({ host: HOST, port: PORTA, user: 'postgres', password: SENHA_SUPER, database: 'postgres' })
  try {
    await admin.connect()
  } catch {
    console.warn('[test-support] Postgres local inacessivel; bancos por worker nao criados (suites de DB vao se pular).')
    await admin.end().catch(() => {})
    return
  }
  try {
    // CREATE ... TEMPLATE exige que o template nao tenha conexoes.
    await terminarConexoes(admin, base)
    for (let i = 1; i <= N; i++) {
      const db = nomeBancoWorker(i)
      await terminarConexoes(admin, db)
      await admin.query(`drop database if exists "${db}"`)
      await admin.query(`create database "${db}" template "${base}"`)
    }
    console.log(`[test-support] ${N} bancos por worker prontos: ${nomeBancoWorker(1)}..w${N}.`)
  } finally {
    await admin.end().catch(() => {})
  }
}
