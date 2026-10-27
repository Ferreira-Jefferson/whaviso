import { parseEnv } from '@whaviso/shared/config'
import { criarCifra } from '@whaviso/shared/cifra'
import { criarPool } from '@whaviso/shared/db'
import { criarLogger } from '@whaviso/shared/logger'
import { envSchema } from './env'
import { criarApp } from './app'
import { criarClienteWhatsMeta } from './shared/meta_client'
import { iniciarScheduler } from './scheduler'
import { drenarEnvios } from './modules/enviar'

// Fonte unica local: o .env da raiz traz vars prefixadas por servico (ZAP_*).
// Em prod o host pode definir PORT/DATABASE_URL direto; o alias so preenche se faltarem.
if (process.env.ZAP_PORT && !process.env.PORT) process.env.PORT = process.env.ZAP_PORT
if (process.env.ZAP_HOST && !process.env.HOST) process.env.HOST = process.env.ZAP_HOST
if (process.env.ZAP_DATABASE_URL && !process.env.DATABASE_URL)
  process.env.DATABASE_URL = process.env.ZAP_DATABASE_URL

const env = parseEnv(envSchema)
const logger = criarLogger('zap', env.LOG_LEVEL)
const pool = criarPool({ connectionString: env.DATABASE_URL, max: 3 })

// Transporte oficial (Meta Cloud API): exige as 4 credenciais essenciais. Sem elas o zap
// nao envia nem recebe nada, entao falha o boot com mensagem clara (em vez de subir mudo).
if (
  !env.META_ACCESS_TOKEN ||
  !env.META_PHONE_NUMBER_ID ||
  !env.META_APP_SECRET ||
  !env.META_VERIFY_TOKEN
) {
  logger.error(
    'META_* ausentes: defina META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, META_APP_SECRET e META_VERIFY_TOKEN',
  )
  process.exit(1)
}

// Transporte VIVO (SEC-070): fetchSeguro com allowlist de host, sem redirect para rede interna,
// multi-numero (token por chamada). O dreno da outbox (ZAP-enviar) envia por aqui; o webhook
// (ZAP-webhook) usa so `verificarAssinatura` (HMAC do corpo cru com o appSecret).
const whats = criarClienteWhatsMeta({
  appSecret: env.META_APP_SECRET,
  apiVersion: env.META_API_VERSION,
  graphHost: new URL(env.META_GRAPH_URL).host,
})

// Cifra do processo (a MESMA MASTER_KEY da api): decifra token do numero e telefone do cliente
// so no instante do uso. Sem MASTER_KEY o dreno nao decifra (fica inativo) e o webhook nao
// persiste mensagem de entrada (so recibos); avisa claro em vez de falhar silencioso.
const cifra = env.MASTER_KEY ? criarCifra(env.MASTER_KEY) : undefined
if (!cifra) {
  logger.error('MASTER_KEY ausente: o dreno de envios fica inativo e o inbound nao persiste mensagens')
}

const app = await criarApp({ env, pool, logger, whats, cifra })

// Laco de drenagem da outbox: cada tick recupera orfaos, reivindica um lote e envia. Sem
// cifra o tick e no-op (o dreno nao decifra tokens). Ticks nao se sobrepoem (ver scheduler).
const tick = cifra
  ? async () => {
      const resumo = await drenarEnvios({ pool, whats, cifra, logger })
      if (resumo.reivindicados || resumo.orfaos) logger.info(resumo, 'dreno de envios')
    }
  : async () => undefined
const scheduler = iniciarScheduler({ logger, intervaloMs: env.SCHEDULER_INTERVAL_MS, tick })

// Encerramento limpo e idempotente: para o scheduler antes de fechar o pool (senao um tick em
// voo usa o pool ja encerrado). SIGINT e SIGTERM podem chegar ambos; so roda 1x.
let encerrando = false
const encerrar = async () => {
  if (encerrando) return
  encerrando = true
  scheduler.parar()
  await app.close().catch(() => undefined)
  await pool.end().catch(() => undefined)
  process.exit(0)
}
process.on('SIGINT', () => void encerrar())
process.on('SIGTERM', () => void encerrar())

// Bind em loopback por padrao (nginx faz proxy p/ 127.0.0.1:3002); configuravel por ZAP_HOST.
await app.listen({ port: env.PORT, host: env.HOST })
