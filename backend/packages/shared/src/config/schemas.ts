// Schemas tipados de env por servico. Fonte unica: cada app importa o seu e deriva o tipo.
// Mensagens do zod nao ecoam valores; segredos aqui sao so referencia (uso nos modulos).
import { z } from 'zod'

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')

/** Campos comuns a todo servico Node do monorepo. */
export const envBaseSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1, 'string de conexao do pooler'),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).default(15_000),
})

export const envApiSchema = envBaseSchema.extend({
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().min(1, 'string de conexao do pooler (user whaviso_api)'),
  SUPABASE_URL: z.url(),
  APP_URL: z.url().describe('origem do SPA (usada pelo CORS)'),
  /** Conexao DIRETA/session p/ LISTEN do realtime (pooler em modo transacao nao suporta LISTEN). Default: DATABASE_URL. */
  DATABASE_URL_LISTEN: z.string().min(1).optional(),
  /** Opcionais: por padrao derivados de SUPABASE_URL pelo verificador de F3. */
  SUPABASE_JWKS_URL: z.url().optional(),
  SUPABASE_ISSUER: z.url().optional(),
  /** Chave mestra de segredos (referencia; uso nos modulos de segredo). */
  MASTER_KEY: z.string().min(32, 'minimo 32 caracteres').optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_JANELA: z.string().default('1 minute'),
  /** Desliga o rate limit global (so testes de carga locais). */
  RATE_LIMIT_DESLIGADO: bool.default(false),
})

export const envZapSchema = envBaseSchema.extend({
  PORT: z.coerce.number().int().default(3002),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(3),
  DATABASE_URL: z.string().min(1, 'string de conexao do pooler (user whaviso_zap)'),
  MASTER_KEY: z.string().min(32).optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_WABA_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
})

export const envAtendenteSchema = envBaseSchema.extend({
  PORT: z.coerce.number().int().default(3003),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(3),
  DATABASE_URL: z.string().min(1, 'string de conexao do pooler (user whaviso_atendente)'),
  MASTER_KEY: z.string().min(32).optional(),
})

export type EnvBase = z.infer<typeof envBaseSchema>
export type EnvApiTipado = z.infer<typeof envApiSchema>
export type EnvZapTipado = z.infer<typeof envZapSchema>
export type EnvAtendenteTipado = z.infer<typeof envAtendenteSchema>
