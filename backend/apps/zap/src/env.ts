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

  // Chave mestra da cifra (a MESMA da api): o zap decifra token_cifrado de numeros_whatsapp
  // e telefone_cifrado de clientes só no instante do envio (drenar a outbox). Opcional no
  // schema para o harness de teste; sem ela o dreno de envios não sobe (server.ts avisa).
  MASTER_KEY: z.string().min(32, 'minimo 32 caracteres').optional(),

  // Meta Cloud API (transporte oficial do WhatsApp). App Secret + verify token sao do APP
  // registrado na Meta (HMAC do webhook + handshake), compartilhados por todos os numeros
  // (loja e oficial): continuam em env porque nao mudam em runtime. Opcionais no schema para
  // o harness de teste e o typecheck; o server.ts EXIGE os dois no boot e encerra com mensagem
  // clara se faltarem.
  //
  // O access_token/phone_number_id/waba_id do NUMERO OFICIAL (usado em OTP/notificacao futura)
  // saiu daqui: agora e credencial administravel em /plataforma/configuracoes (migration 0096,
  // modulo credenciais_plataforma), lida do banco pelo zap a cada tick, nao mais env+redeploy.
  META_APP_SECRET: z.string().optional().describe('App Secret p/ validar a assinatura do webhook'),
  META_VERIFY_TOKEN: z.string().optional().describe('verify token do handshake do webhook'),
  META_GRAPH_URL: z.url().default('https://graph.facebook.com'),
  META_API_VERSION: z.string().default('v23.0'),

  // E-mail transacional (Resend): a chave saiu daqui tambem (mesmo motivo acima) e agora e
  // credencial administravel em /plataforma/configuracoes (migration 0096), lida do banco a
  // cada tick do dreno (ZAP-enviar-email). Sem credencial configurada o dreno fica idle (fila
  // retida; o boot nao quebra).

  // Admin API do Supabase (service role key). OPCIONAIS. NUNCA vão ao bundle do front.
  SUPABASE_URL: z.url().optional().describe('URL do Supabase para a Admin API'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .optional()
    .describe('service role key do Supabase'),
})

export type EnvZap = z.infer<typeof envSchema>
