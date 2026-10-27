import type { FastifyInstance } from 'fastify'
import { parseEnv } from '@whaviso/shared/config'
import { criarCifra } from '@whaviso/shared/cifra'
import { criarPool } from '@whaviso/shared/db'
import { criarLogger } from '@whaviso/shared/logger'
import { envSchema } from './env'
import { criarApp } from './app'
import { criarClienteMeta, criarClienteWhatsMeta } from './shared/meta_client'
import { iniciarScheduler } from './scheduler'
import { drenarEnvios } from './modules/enviar'

// Fonte única local: o .env da raiz traz vars prefixadas por serviço (ZAP_*).
// Em prod o host pode definir PORT/DATABASE_URL direto; o alias só preenche se faltarem.
if (process.env.ZAP_PORT && !process.env.PORT) process.env.PORT = process.env.ZAP_PORT
if (process.env.ZAP_HOST && !process.env.HOST) process.env.HOST = process.env.ZAP_HOST
if (process.env.ZAP_DATABASE_URL && !process.env.DATABASE_URL)
  process.env.DATABASE_URL = process.env.ZAP_DATABASE_URL

const env = parseEnv(envSchema)
const logger = criarLogger('zap', env.LOG_LEVEL)
const pool = criarPool({ connectionString: env.DATABASE_URL, max: 3 })

// Transporte oficial (Meta Cloud API): exige as 4 credenciais essenciais. Sem elas o zap
// não envia nem recebe nada, então falha o boot com mensagem clara (em vez de subir mudo).
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

const metaOpcoes = {
  accessToken: env.META_ACCESS_TOKEN,
  phoneNumberId: env.META_PHONE_NUMBER_ID,
  wabaId: env.META_WABA_ID ?? '',
  appSecret: env.META_APP_SECRET,
  verifyToken: env.META_VERIFY_TOKEN,
  graphUrl: env.META_GRAPH_URL,
  apiVersion: env.META_API_VERSION,
}

// Esqueleto de inbound/saude: a rota /webhook/whatsapp (handshake + eventos) e o estado de
// conexao do healthz seguem no cliente legado, que e territorio de ZAP-webhook/ZAP-meta
// (Onda 1, A FAZER). O transporte de ENVIO que roda de verdade agora e o endurecido abaixo.
const whats = criarClienteMeta(metaOpcoes, { logger, pool })

// Transporte VIVO de ENVIO (SEC-070): fetchSeguro com allowlist de host, sem redirect para
// rede interna, e multi-numero (token por chamada via CredencialResolvida). O dreno da outbox
// (ZAP-enviar) envia por aqui; o appSecret so e usado por verificarAssinatura, nao no envio.
const whatsEnvio = criarClienteWhatsMeta({
  appSecret: env.META_APP_SECRET,
  apiVersion: env.META_API_VERSION,
  graphHost: new URL(env.META_GRAPH_URL).host,
})

// Cifra do processo (a MESMA MASTER_KEY da api): decifra token do numero e telefone do
// cliente so no instante do envio. Sem MASTER_KEY o dreno nao pode decifrar e fica inativo
// (o webhook/healthz seguem de pe); avisa claro em vez de falhar silencioso.
const cifra = env.MASTER_KEY ? criarCifra(env.MASTER_KEY) : undefined
if (!cifra) {
  logger.error('MASTER_KEY ausente: o dreno de envios fica inativo (configure MASTER_KEY, a mesma da api)')
}

const app = await criarApp({ env, pool, logger, whats })
// Monta GET/POST /webhook/whatsapp (handshake + eventos da Meta) antes do listen. O cast
// concilia o FastifyInstance do app (com ZodTypeProvider/logger pino) com o tipo default.
whats.montarRotaWebhook(app as unknown as FastifyInstance)

// Laco de drenagem da outbox: cada tick recupera orfaos, reivindica um lote e envia. Sem
// cifra o tick e no-op (o dreno nao decifra tokens). Ticks nao se sobrepoem (ver scheduler).
const tick = cifra
  ? async () => {
      const resumo = await drenarEnvios({ pool, whats: whatsEnvio, cifra, logger })
      if (resumo.reivindicados || resumo.orfaos) logger.info(resumo, 'dreno de envios')
    }
  : async () => undefined
const scheduler = iniciarScheduler({ logger, intervaloMs: env.SCHEDULER_INTERVAL_MS, tick })

// Valida as credenciais e grava o status (não há QR na Meta); não bloqueia o boot do HTTP.
void whats.conectar().catch((e) => logger.error({ err: e }, 'falha ao conectar à Meta Cloud API'))

// Encerramento limpo e idempotente: para o scheduler antes de fechar o pool (senão um
// tick em voo usa o pool já encerrado). SIGINT e SIGTERM podem chegar ambos; só roda 1x.
let encerrando = false
const encerrar = async () => {
  if (encerrando) return
  encerrando = true
  scheduler.parar()
  await whats.parar().catch(() => undefined)
  await app.close().catch(() => undefined)
  await pool.end().catch(() => undefined)
  process.exit(0)
}
process.on('SIGINT', () => void encerrar())
process.on('SIGTERM', () => void encerrar())

// Bind em loopback por padrão (nginx faz proxy p/ 127.0.0.1:3002); configurável por ZAP_HOST.
await app.listen({ port: env.PORT, host: env.HOST })
