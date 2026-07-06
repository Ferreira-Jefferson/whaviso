import { z } from 'zod'

export const envSchema = z.object({
  PORT: z.coerce.number().int().default(3002),
  // Bind em loopback por padrão (defesa em profundidade): o nginx do mesmo host faz proxy
  // p/ 127.0.0.1:3002, então o zap não precisa escutar em 0.0.0.0. Configurável (ZAP_HOST)
  // caso um dia rode com proxy remoto; o default 127.0.0.1 aceita normalmente o curl local.
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1, 'string de conexão do pooler (user whaviso_zap)'),
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
  LOG_LEVEL: z.string().default('info'),

  // Origem do SPA: usada para montar o link de cadastro da CTA discreta ao cobrador
  // sem conta (H10.7/H8.5). Espelha o APP_URL da api; o server.ts faz o alias do
  // APP_URL do .env único quando ZAP_APP_URL não vier explícito.
  ZAP_APP_URL: z.url().default('http://localhost:5173'),

  // Meta Cloud API (transporte oficial do WhatsApp). Opcionais no schema para o harness
  // de teste e o typecheck; o server.ts EXIGE as 4 essenciais no boot (token, phone_id,
  // app_secret, verify_token) e encerra com mensagem clara se faltarem. O token NUNCA é
  // logado. WABA id só é usado pelo sync de templates (futuro).
  META_ACCESS_TOKEN: z.string().optional().describe('token do System User (permanente) ou de teste'),
  META_PHONE_NUMBER_ID: z.string().optional().describe('Phone Number ID do número na WABA'),
  META_WABA_ID: z.string().optional().describe('WhatsApp Business Account ID'),
  META_APP_SECRET: z.string().optional().describe('App Secret p/ validar a assinatura do webhook'),
  META_VERIFY_TOKEN: z.string().optional().describe('verify token do handshake do webhook'),
  META_GRAPH_URL: z.url().default('https://graph.facebook.com'),
  META_API_VERSION: z.string().default('v23.0'),
  // Template AUTHENTICATION do OTP de login (registrado na Meta; categoria AUTHENTICATION,
  // formato fixo). O nome aqui deve bater com o nome aprovado na WABA.
  META_OTP_TEMPLATE: z.string().default('whaviso_otp'),
  META_OTP_IDIOMA: z.string().default('pt_BR'),

  // Send SMS Hook do Supabase: gera o OTP do login por telefone e POSTa em
  // /hooks/send-code (assinatura Standard Webhooks); entregamos o código por template
  // AUTHENTICATION da Meta. Sem o secret a rota responde 503 (recurso desligado).
  SEND_CODE_HOOK_SECRET: z.string().optional().describe('segredo whsec_ do Send SMS Hook'),

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
