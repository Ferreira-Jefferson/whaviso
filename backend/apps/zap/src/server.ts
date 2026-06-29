import { join } from 'node:path'
import { parseEnv } from '@whaviso/shared/config'
import { criarPool } from '@whaviso/shared/db'
import { criarLogger } from '@whaviso/shared/logger'
import { envSchema } from './env'
import { criarApp } from './app'
import { criarClienteWhats } from './shared/baileys_client'
import { adquirirLock, liberarLock } from './shared/baileys_client/lock'
import { lerEConsumirComando } from './shared/baileys_client/qr'
import { registrarInboundWhats } from './modules/webhook_whatsapp'
import { registrarInboundTeste } from './modules/testar_envio'
import { criarAdminSupabase } from './shared/supabase_admin'
import { iniciarScheduler } from './scheduler'

// Fonte única local: o .env da raiz traz vars prefixadas por serviço (ZAP_*).
// Em prod o host pode definir PORT/DATABASE_URL direto; o alias só preenche se faltarem.
if (process.env.ZAP_PORT && !process.env.PORT) process.env.PORT = process.env.ZAP_PORT
if (process.env.ZAP_DATABASE_URL && !process.env.DATABASE_URL)
  process.env.DATABASE_URL = process.env.ZAP_DATABASE_URL
// O .env único traz APP_URL (origem do SPA, sem prefixo): reaproveita para a CTA de
// cadastro ao cobrador sem conta (H10.7), sem duplicar a var.
if (process.env.APP_URL && !process.env.ZAP_APP_URL) process.env.ZAP_APP_URL = process.env.APP_URL

const env = parseEnv(envSchema)
const logger = criarLogger('zap', env.LOG_LEVEL)
const pool = criarPool({ connectionString: env.DATABASE_URL, max: 3 })

// Instância única: dois processos brigando pela sessão causam o erro 440.
const arquivoLock = join(env.WHATS_AUTH_DIR, '..', '.baileys.lock')
if (!adquirirLock(arquivoLock, logger)) {
  logger.error('não foi possível adquirir o lock do WhatsApp; encerrando')
  process.exit(1)
}

const whats = criarClienteWhats(
  {
    authDir: env.WHATS_AUTH_DIR,
    phone: env.WHATS_PHONE,
    usePairing: env.WHATS_USE_PAIRING,
    browser: env.WHATS_BROWSER,
    humanize: env.WHATS_HUMANIZE,
    dryRun: env.WHATS_DRY_RUN,
    gapMin: env.WHATS_GAP_MIN,
    gapMax: env.WHATS_GAP_MAX,
    batchSize: env.WHATS_BATCH_SIZE,
    batchPauseMin: env.WHATS_BATCH_PAUSE_MIN,
    batchPauseMax: env.WHATS_BATCH_PAUSE_MAX,
    maxPorHora: env.WHATS_MAX_POR_HORA,
  },
  { logger, pool },
)

// Conta-no-aceite (H5.3): Admin API do Supabase, só se a service role key estiver
// configurada (senão o aceite só vincula por telefone, degrada sem quebrar).
const admin =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? criarAdminSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : null

// Inbound de botões/texto pelo socket (app-root liga o módulo; módulo não importa módulo).
registrarInboundWhats({ pool, logger, whats, admin })
// Captura as respostas do número de teste no mini-chat de diagnóstico (sandbox).
registrarInboundTeste({ pool, logger, whats })

const app = await criarApp({ env, pool, logger, whats })
const scheduler = iniciarScheduler({
  pool,
  logger,
  whats,
  intervaloMs: env.SCHEDULER_INTERVAL_MS,
  appUrl: env.ZAP_APP_URL,
})

// Conecta ao WhatsApp em paralelo ao boot do HTTP (o envio só ocorre quando online).
void whats.conectar().catch((e) => logger.error({ err: e }, 'falha ao conectar ao WhatsApp'))

// Comandos do admin (api) chegam pela tabela whats_sessao: a api só enfileira,
// quem age é o zap (dono do socket). Poll de 1,5s: claim numa linha só, custo
// irrisório, e encurta o tempo entre clicar "Conectar" e o QR começar a gerar.
let processandoComando = false
const timerComando = setInterval(() => {
  if (processandoComando) return
  processandoComando = true
  void (async () => {
    try {
      const comando = await lerEConsumirComando(pool)
      if (comando === 'conectar') await whats.conectar()
      else if (comando === 'desconectar') await whats.desconectar()
    } catch (e) {
      logger.error({ err: e }, 'falha ao processar comando do WhatsApp')
    } finally {
      processandoComando = false
    }
  })()
}, 1_500)

const encerrar = async () => {
  clearInterval(timerComando)
  scheduler.parar()
  await whats.parar().catch(() => undefined)
  await app.close()
  await pool.end()
  liberarLock(arquivoLock)
  process.exit(0)
}
process.on('SIGINT', () => void encerrar())
process.on('SIGTERM', () => void encerrar())
process.on('exit', () => liberarLock(arquivoLock))

await app.listen({ port: env.PORT, host: '0.0.0.0' })
