// Boot do worker atendente (AT-motor-min): valida env, abre o pool (user whaviso_atendente),
// monta e VALIDA o registry de nodes contra o grafo fixo (crash no boot se inconsistente) e sobe
// o laco que drena o inbound a cada tick. SEM Meta, SEM LLM: o motor decide por botao/regra.
import { parseEnv } from '@whaviso/shared/config'
import { criarPool } from '@whaviso/shared/db'
import { criarLogger } from '@whaviso/shared/logger'
import { envSchema } from './env'
import { criarRegistry, drenarInbound } from './modules/motor_fluxo'
import { iniciarScheduler } from './scheduler'
import { iniciarSaude } from './saude'

// Fonte unica local: o .env da raiz traz vars prefixadas por servico (ATENDENTE_*).
if (process.env.ATENDENTE_PORT && !process.env.PORT) process.env.PORT = process.env.ATENDENTE_PORT
if (process.env.ATENDENTE_HOST && !process.env.HOST) process.env.HOST = process.env.ATENDENTE_HOST
if (process.env.ATENDENTE_DATABASE_URL && !process.env.DATABASE_URL)
  process.env.DATABASE_URL = process.env.ATENDENTE_DATABASE_URL

const env = parseEnv(envSchema)
const logger = criarLogger('atendente', env.LOG_LEVEL)
const pool = criarPool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  connectTimeoutMs: env.DB_CONNECT_TIMEOUT_MS,
  idleTimeoutMs: env.DB_IDLE_TIMEOUT_MS,
  statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
})

// Registry validado no boot: todo node do grafo tem implementacao, toda transicao aponta para um
// tipo conhecido e nenhum node usa LLM (fronteira do motor-min). Inconsistencia derruba o boot.
const registry = criarRegistry()

const intervaloMs = Number(process.env.ATENDENTE_INTERVALO_MS ?? 5000)
const tick = async () => {
  const resumo = await drenarInbound({ pool, logger, registry })
  if (resumo.processadas || resumo.suprimidas) logger.info(resumo, 'dreno de inbound')
}
const scheduler = iniciarScheduler({ logger, intervaloMs, tick })
const saude = iniciarSaude(env.HOST, env.PORT)

// Encerramento limpo e idempotente: para o scheduler antes de fechar o pool.
let encerrando = false
const encerrar = async () => {
  if (encerrando) return
  encerrando = true
  scheduler.parar()
  saude.close()
  await pool.end().catch(() => undefined)
  process.exit(0)
}
process.on('SIGINT', () => void encerrar())
process.on('SIGTERM', () => void encerrar())

logger.info({ porta: env.PORT, intervaloMs }, 'atendente no ar')
