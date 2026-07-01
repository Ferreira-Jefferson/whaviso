import type { FastifyInstance } from 'fastify'
import { parseEnv } from '@whaviso/shared/config'
import { criarPool } from '@whaviso/shared/db'
import { criarLogger } from '@whaviso/shared/logger'
import { envSchema } from './env'
import { criarApp } from './app'
import { criarClienteMeta } from './shared/meta_client'
import { registrarInboundWhats } from './modules/webhook_whatsapp'
import { registrarInboundTeste } from './modules/testar_envio'
import { processarStatusTemplate } from './modules/sincronizar_templates'
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

const whats = criarClienteMeta(metaOpcoes, { logger, pool })

// Conta-no-aceite (H5.3): Admin API do Supabase, só se a service role key estiver
// configurada (senão o aceite só vincula por telefone, degrada sem quebrar).
const admin =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? criarAdminSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    : null

// Inbound (botões/texto/status) pelo webhook (app-root liga o módulo; módulo não importa
// módulo). Os handlers ficam guardados no cliente Meta e a rota do webhook os chama.
registrarInboundWhats({ pool, logger, whats, admin })
// Captura as respostas do número de teste no mini-chat de diagnóstico (sandbox).
registrarInboundTeste({ pool, logger, whats })
// Aprovação/recusa de template pela Meta (webhook message_template_status_update) reflete
// no status_meta em tempo real (sincronizar_templates); o reconcile periódico é a rede de
// segurança. App-root cruza a fronteira ligando o handler ao provider.
whats.onTemplateStatus((e) => processarStatusTemplate({ pool, logger }, e))

const app = await criarApp({ env, pool, logger, whats })
// Monta GET/POST /webhook/whatsapp (handshake + eventos da Meta) antes do listen. O cast
// concilia o FastifyInstance do app (com ZodTypeProvider/logger pino) com o tipo default.
whats.montarRotaWebhook(app as unknown as FastifyInstance)

const scheduler = iniciarScheduler({
  pool,
  logger,
  whats,
  intervaloMs: env.SCHEDULER_INTERVAL_MS,
  appUrl: env.ZAP_APP_URL,
  // Submissão/reconcile de templates só com WABA id (precisa dele nas chamadas Graph).
  metaOpcoes: metaOpcoes.wabaId ? metaOpcoes : undefined,
})

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

await app.listen({ port: env.PORT, host: '0.0.0.0' })
