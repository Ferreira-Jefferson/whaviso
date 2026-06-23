import { z } from 'zod'

export const envSchema = z.object({
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().min(1, 'string de conexão do pooler (user whaviso_api)'),
  SUPABASE_URL: z.url(),
  APP_URL: z.url().describe('origem do SPA (usada pelo CORS)'),
  // Número do WhatsApp do Whaviso (Baileys), só dígitos com DDI (ex.: 5511999998888).
  // Usado para montar o link wa.me do CONVITE (H2.2): o devedor fala com o Whaviso, não
  // com o cobrador. Opcional: sem ele, a resposta de criação vem sem link_whatsapp (a
  // UI cai no fallback de copiar a mensagem/número). NUNCA é o site.
  WHAVISO_WHATSAPP: z
    .string()
    .regex(/^[1-9][0-9]{9,14}$/, 'número do Whaviso em dígitos com DDI (ex.: 5511999998888)')
    .optional()
    .describe('número do WhatsApp do Whaviso para o link wa.me do convite (H2.2)'),
  LOG_LEVEL: z.string().default('info'),
  // SERVICE ROLE KEY do Supabase: segredo de SERVIDOR (nunca vai ao bundle do front).
  // Usada SÓ pela Admin API do GoTrue para criar a conta por baixo dos panos no aceite
  // (H1.4). Opcional: sem ela, a conta-no-aceite fica desligada (o aceite só vincula
  // por telefone, comportamento anterior), e o app sobe normalmente.
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .optional()
    .describe('service role key do Supabase; conta-no-aceite (H1.4)'),
  // Segredo opcional do webhook de pagamento (header x-webhook-secret). Em prod,
  // o ideal é validar a assinatura do provedor; isto é o mínimo enquanto stub.
  BILLING_WEBHOOK_SECRET: z.string().optional(),
})

export type EnvApi = z.infer<typeof envSchema>
