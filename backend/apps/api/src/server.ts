import { parseEnv } from '@whaviso/shared/config'
import { consultar, criarPool, sqlBruto } from '@whaviso/shared/db'
import { criarLogger } from '@whaviso/shared/logger'
import { envSchema } from './env'
import { construirApp } from './app'

// Fonte unica local: o .env da raiz traz vars prefixadas por servico (API_*).
// Em prod o host pode definir PORT/DATABASE_URL direto; o alias so preenche se faltarem.
if (process.env.API_PORT && !process.env.PORT) process.env.PORT = process.env.API_PORT
if (process.env.API_HOST && !process.env.HOST) process.env.HOST = process.env.API_HOST
if (process.env.API_DATABASE_URL && !process.env.DATABASE_URL)
  process.env.DATABASE_URL = process.env.API_DATABASE_URL

const env = parseEnv(envSchema)
const logger = criarLogger('api', env.LOG_LEVEL)
const pool = criarPool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  connectTimeoutMs: env.DB_CONNECT_TIMEOUT_MS,
  idleTimeoutMs: env.DB_IDLE_TIMEOUT_MS,
  statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
})

// SEC-010/011: a api roda com privilegio minimo. Superusuario em producao = boot recusado.
const [papel] = await consultar<{ papel: string; super: boolean }>(
  pool,
  sqlBruto(
    'select current_user::text as papel, coalesce((select rolsuper from pg_roles where rolname = current_user), false) as super',
  ),
)
if (papel?.super) {
  if (env.NODE_ENV === 'production') {
    logger.fatal({ papel: papel.papel }, 'api conectada como superusuario: recusando subir')
    process.exit(1)
  }
  logger.warn({ papel: papel.papel }, 'api conectada como superusuario (so aceitavel fora de producao)')
}

const app = await construirApp({ env, pool, logger })

let encerrando = false
const encerrar = async (codigo: number) => {
  if (encerrando) return
  encerrando = true
  // Trava de seguranca: se o fechamento pendurar, sai mesmo assim.
  setTimeout(() => process.exit(1), 10_000).unref()
  try {
    await app.close()
    await pool.end()
  } catch (erro) {
    logger.error({ err: erro }, 'falha ao encerrar')
    codigo = 1
  }
  process.exit(codigo)
}
process.on('SIGINT', () => void encerrar(0))
process.on('SIGTERM', () => void encerrar(0))
// Sem vazar dado: o logger redige err (stack/config) por nome de campo.
process.on('unhandledRejection', (motivo) => {
  logger.error({ err: motivo }, 'unhandledRejection')
})
process.on('uncaughtException', (erro) => {
  logger.fatal({ err: erro }, 'uncaughtException')
  void encerrar(1)
})

// Bind em loopback por padrao (nginx faz proxy p/ 127.0.0.1:3001); configuravel por API_HOST.
await app.listen({ port: env.PORT, host: env.HOST })
