import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import {
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import type { Pool } from '@whaviso/shared/db'
import { consultar, sqlBruto } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { serializerCompilerRapido } from './shared/serializacao'
import { tratadorDeErros, tratadorNaoEncontrado } from './shared/http_errors'
import { registrarModulos, type ModuloRota } from './routes'
import { criarAdminSupabase, type AdminSupabase } from './shared/supabase_admin'
import { autenticarPlugin, criarVerificadorSupabase, type Verificador } from './shared/auth'
import { escopoLojaPlugin, criarLeitorEscopoSql, comCoalescencia } from './shared/tenant'
import { escopoOperadorPlugin } from './shared/operador'
import { realtimePlugin } from './shared/realtime'
import type { EnvApi } from './env'

declare module 'fastify' {
  interface FastifyInstance {
    pool: Pool
    env: EnvApi
    /** Admin API do Supabase; null quando a SERVICE ROLE KEY nao esta configurada. */
    adminSupabase: AdminSupabase | null
  }
}

export interface DepsApi {
  env: EnvApi
  /** Pool conectado como role `whaviso_api` (privilegio minimo). */
  pool: Pool
  logger: Logger | false
  /** Injetavel p/ testes (sem rede/JWKS). Padrao: JWKS do Supabase. */
  verificador?: Verificador
  /** Registry de modulos; padrao = MODULOS de routes.ts. Injetavel p/ testes. */
  modulos?: readonly ModuloRota[]
}

/** Contrato do GET /healthz. */
export interface HealthDto {
  ok: boolean
  servico: 'api'
}

export async function construirApp(deps: DepsApi) {
  const app = Fastify({
    loggerInstance: deps.logger === false ? undefined : deps.logger,
    logger: deps.logger === false ? false : undefined,
    // Ver nota original: so confia no proxy do loopback (nginx no mesmo host), para que
    // req.ip seja o IP real do cliente e o rate limit por IP nao seja burlavel via XFF.
    trustProxy: 'loopback',
    // Corpo pequeno por padrao (API JSON); rota que precisar de mais declara bodyLimit.
    bodyLimit: 256 * 1024,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  // fast-json-stringify (so emite campos declarados = whitelist de PII) com fallback ao serializer zod.
  app.setSerializerCompiler(serializerCompilerRapido)
  app.setErrorHandler(tratadorDeErros)
  app.setNotFoundHandler(tratadorNaoEncontrado)

  app.decorate('pool', deps.pool)
  app.decorate('env', deps.env)
  app.decorate(
    'adminSupabase',
    deps.env.SUPABASE_SERVICE_ROLE_KEY
      ? criarAdminSupabase(deps.env.SUPABASE_URL, deps.env.SUPABASE_SERVICE_ROLE_KEY)
      : null,
  )

  // SEC-090: API JSON pura. CSP fechada (nada carrega nem emoldura), HSTS, nosniff,
  // frameguard DENY, no-referrer. COEP/CORP desligados p/ nao atrapalhar XHR da SPA.
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  })
  // Auth via header Authorization: Bearer (nao cookie): sem credentials. Origem unica = APP_URL.
  await app.register(cors, {
    // Funcao (nao string): origem estranha NAO recebe Access-Control-Allow-Origin.
    origin: (origem, cb) => cb(null, origem === undefined || origem === deps.env.APP_URL),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'x-loja-id', 'last-event-id', 'cache-control'],
  })
  // SEC-101: limite global por IP configuravel por env; por rota via
  // `config: { rateLimit: { max, timeWindow } }` (ver AGENTS.md).
  await app.register(rateLimit, {
    global: !deps.env.RATE_LIMIT_DESLIGADO,
    max: deps.env.RATE_LIMIT_MAX,
    timeWindow: deps.env.RATE_LIMIT_JANELA,
  })

  // F3: autenticacao primeiro; os dois escopos dependem de 'whaviso-autenticar'.
  const verificador =
    deps.verificador ?? criarVerificadorSupabase({ supabaseUrl: deps.env.SUPABASE_URL })
  // Coalesce o burst concorrente de resolucoes de escopo da mesma pagina numa ida so, sem janela
  // de staleness (ver cache_escopo.ts). Um leitor compartilhado pelos dois plugins de escopo.
  const leitor = comCoalescencia(criarLeitorEscopoSql(deps.pool))
  await app.register(autenticarPlugin, { verificador })
  await app.register(escopoLojaPlugin, { leitor, auditoria: deps.pool })
  await app.register(escopoOperadorPlugin, { leitor })

  // F5: SSE (GET /realtime/stream). LISTEN dedicado (conexao direta), aberto no 1o cliente.
  await app.register(realtimePlugin, {
    connectionString: deps.env.DATABASE_URL_LISTEN ?? deps.env.DATABASE_URL,
  })

  app.get('/healthz', async (_req, reply): Promise<HealthDto> => {
    try {
      await consultar(deps.pool, sqlBruto('select 1'))
      return { ok: true, servico: 'api' }
    } catch {
      void reply.status(503)
      return { ok: false, servico: 'api' }
    }
  })

  await app.register(registrarModulos(deps.modulos), { prefix: '/v1' })

  return app
}

/** Alias legado. */
export const criarApp = construirApp
