import { z } from 'zod'

export const envSchema = z.object({
  PORT: z.coerce.number().int().default(3001),
  // Bind em loopback por padrão (defesa em profundidade): o nginx do mesmo host faz proxy
  // p/ 127.0.0.1:3001, então a api não precisa escutar em 0.0.0.0. Configurável (API_HOST)
  // caso um dia rode com proxy remoto; o default 127.0.0.1 aceita o curl local normalmente.
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1, 'string de conexão do pooler (user whaviso_api)'),
  SUPABASE_URL: z.url(),
  APP_URL: z.url().describe('origem do SPA (usada pelo CORS)'),
  // (removido em E5 H5.0) WHAVISO_WHATSAPP servia para montar o link wa.me do convite que o
  // criador compartilhava à mão. Agora o Whaviso ENVIA o convite direto ao convidado (o zap
  // manda o template), então a api não monta mais link e o número do Whaviso não é usado aqui.
  LOG_LEVEL: z.string().default('info'),
  // SERVICE ROLE KEY do Supabase: segredo de SERVIDOR (nunca vai ao bundle do front).
  // Usada SÓ pela Admin API do GoTrue para criar a conta por baixo dos panos no aceite
  // (H1.4). Opcional: sem ela, a conta-no-aceite fica desligada (o aceite só vincula
  // por telefone, comportamento anterior), e o app sobe normalmente.
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .optional()
    .describe('service role key do Supabase; conta-no-aceite (H1.4)'),
})

export type EnvApi = z.infer<typeof envSchema>
