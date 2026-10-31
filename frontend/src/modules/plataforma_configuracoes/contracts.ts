// Contratos Zod PROPRIOS (espelham a api; nao ha pacote compartilhado para estes modulos).
// Segredo sempre write-only: nenhum schema de SAIDA carrega a chave/token em claro.
import { z } from 'zod'

// ---- Asaas (credencial do PSP, ja existente em plataforma_cobranca... mas e do modulo
// pagamentos; schema proprio aqui porque modulo nunca importa modulo) ---------------------------
export const AsaasStatus = z.object({
  configurada: z.boolean(),
  atualizado_em: z.string().nullable(),
})
export type AsaasStatus = z.infer<typeof AsaasStatus>
export interface AsaasEntrada {
  chave: string
}

// ---- WhatsApp oficial (numero usado pelo zap: OTP/notificacao futura) --------------------------
export const WhatsappOficialStatus = z.object({
  configurada: z.boolean(),
  phone_number_id: z.string().nullable(),
  waba_id: z.string().nullable(),
  atualizado_em: z.string(),
})
export type WhatsappOficialStatus = z.infer<typeof WhatsappOficialStatus>
export interface WhatsappOficialEntrada {
  access_token: string
  phone_number_id: string
  waba_id?: string | null
}

// ---- E-mail transacional (Resend) --------------------------------------------------------------
export const EmailPlataformaStatus = z.object({
  configurada: z.boolean(),
  remetente: z.string().nullable(),
  atualizado_em: z.string(),
})
export type EmailPlataformaStatus = z.infer<typeof EmailPlataformaStatus>
export interface EmailPlataformaEntrada {
  api_key: string
  remetente: string
}

// ---- Pool de chaves de LLM da plataforma --------------------------------------------------------
export const provedorLlm = z.enum(['openrouter', 'anthropic', 'outro'])
export type ProvedorLlm = z.infer<typeof provedorLlm>

export const PoolLlmItem = z.object({
  id: z.string(),
  nome: z.string(),
  provedor: provedorLlm,
  ultimos4: z.string().nullable(),
  ativo: z.boolean(),
  criado_em: z.string().nullable(),
  atualizado_em: z.string().nullable(),
})
export type PoolLlmItem = z.infer<typeof PoolLlmItem>
export const PoolLlmLista = z.array(PoolLlmItem)

export interface PoolLlmCriar {
  nome: string
  provedor: ProvedorLlm
  chave: string
}
export interface PoolLlmPatch {
  nome?: string
  ativo?: boolean
  chave?: string
}
