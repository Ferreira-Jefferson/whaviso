import { z } from 'zod'

// Boleano vindo de env (string): só 'true'/'1' liga; o resto desliga. Evita o
// footgun do z.coerce.boolean(), que trata "false" como true.
const ligado = (padrao: 'true' | 'false') =>
  z
    .string()
    .default(padrao)
    .transform((v) => v === 'true' || v === '1')

export const envSchema = z.object({
  PORT: z.coerce.number().int().default(3002),
  DATABASE_URL: z.string().min(1, 'string de conexão do pooler (user whaviso_zap)'),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
  LOG_LEVEL: z.string().default('info'),

  // WhatsApp via Baileys (não oficial). É o transporte atual até a base chegar a
  // ~100 clientes; depois migra p/ a Meta Cloud API (ver CLAUDE.md). Sessão em
  // WHATS_AUTH_DIR (precisa persistir na VPS); processo único (lock no boot).
  WHATS_AUTH_DIR: z.string().default('./auth_baileys'),
  WHATS_PHONE: z.string().optional().describe('nosso número, só dígitos, p/ pairing code'),
  WHATS_USE_PAIRING: ligado('false'),
  WHATS_BROWSER: z.string().default('Whaviso'),
  WHATS_HUMANIZE: ligado('true'),
  WHATS_DRY_RUN: ligado('false'),
  // Ritmo anti-bloqueio (defaults iguais ao teste validado).
  WHATS_GAP_MIN: z.coerce.number().int().default(8_000),
  WHATS_GAP_MAX: z.coerce.number().int().default(20_000),
  WHATS_BATCH_SIZE: z.coerce.number().int().default(20),
  WHATS_BATCH_PAUSE_MIN: z.coerce.number().int().default(60_000),
  WHATS_BATCH_PAUSE_MAX: z.coerce.number().int().default(180_000),
  WHATS_MAX_POR_HORA: z.coerce.number().int().default(60),

  // Send SMS Hook do Supabase: gera o OTP do login por telefone e POSTa em
  // /hooks/sms (assinatura Standard Webhooks); entregamos o código pelo Baileys.
  // Sem o secret a rota responde 503 (recurso desligado).
  SEND_SMS_HOOK_SECRET: z.string().optional().describe('segredo whsec_ do Send SMS Hook'),

  // Conta-no-aceite (E5/H5.3): no ACEITE pelo WhatsApp criamos a conta FREE do convidado
  // por baixo dos panos, por telefone confirmado, via Admin API do GoTrue (service role
  // key). Ambas OPCIONAIS: sem elas, o aceite só vincula por telefone (degrada sem
  // quebrar), igual ao comportamento sem a chave na api. NUNCA vão ao bundle do front.
  SUPABASE_URL: z.url().optional().describe('URL do Supabase para a Admin API (conta-no-aceite)'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .optional()
    .describe('service role key do Supabase; conta-no-aceite (H5.3)'),
})

export type EnvZap = z.infer<typeof envSchema>
