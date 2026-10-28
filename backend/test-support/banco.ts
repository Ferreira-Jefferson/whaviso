// Infra de teste compartilhada do backend (escopo backend; ver README desta pasta).
// Centraliza o acesso a banco nos testes: nome do banco por worker e a fabrica de pools.
// Cada workspace/modulo consome daqui, nunca reinventa pool nem default de banco.
//
// Como o isolamento funciona: cada worker do vitest (pool 'forks') recebe um clone
// proprio do banco de teste (whaviso_dev_w<id>), criado em global-setup.ts e fixado em
// PGDATABASE por setup-banco.ts. Arquivos em workers diferentes usam bancos diferentes;
// arquivos no mesmo worker rodam em serie no tempo. Assim o paralelismo entre arquivos e
// seguro mesmo com advisory locks e testes de corrida.
import pg from 'pg'
import os from 'node:os'

// Numero de workers (= de bancos-clone). Por CPU, com teto, pois mais workers com setup
// pesado (clone + conexoes) rende menos (medido). VITEST_MAX_FORKS sobrepoe. Em CI de 2
// cores vira 2; nesta maquina, o teto. Config e global-setup leem daqui para casarem.
export const NUM_WORKERS = Number(
  process.env.VITEST_MAX_FORKS ?? Math.max(1, Math.min(os.availableParallelism?.() ?? 4, 8)),
)

export const HOST = process.env.PGHOST ?? '127.0.0.1'
export const PORTA = Number(process.env.PGPORT ?? '5432')
export const SENHA_SUPER = process.env.POSTGRES_PASSWORD ?? process.env.PGPASSWORD ?? 'postgres'

/** Nome-base do banco de teste (template a clonar), sem sufixo de worker nem escopo. */
export function bancoBase(): string {
  return process.env.PGDATABASE_BASE ?? process.env.PGDATABASE ?? 'whaviso_dev'
}

/** Escopo do workspace (api, atendente, ...): isola os bancos por worker entre workspaces,
 *  para o gate (api -> atendente) nunca dropar o banco que o outro esta usando. */
function escopo(): string {
  return process.env.TEST_DB_SCOPE ?? 'test'
}

/** Banco de um worker: base + escopo + id. Ex.: whaviso_dev_api_w3. */
export function nomeBancoWorker(id: string | number): string {
  return `${bancoBase()}_${escopo()}_w${id}`
}

/** Banco deste worker. setup-banco.ts ja fixou PGDATABASE no clone do worker (ou na base, fora do vitest). */
export function bancoDoWorker(): string {
  return process.env.PGDATABASE ?? bancoBase()
}

/** Pool pg de um role de servico, apontando para o banco deste worker. */
export function criarPool(usuario: string, senha: string, max = 4): pg.Pool {
  return new pg.Pool({ host: HOST, port: PORTA, user: usuario, password: senha, database: bancoDoWorker(), max })
}

/** Pool de superusuario (postgres) no banco deste worker, para semear o que exige FK/privilegio. */
export function criarPoolSuper(max = 4): pg.Pool {
  return criarPool('postgres', SENHA_SUPER, max)
}
