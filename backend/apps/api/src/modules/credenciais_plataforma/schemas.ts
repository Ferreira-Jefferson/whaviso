// Contratos de borda do modulo credenciais_plataforma. Contratos proprios (nao ha pacote
// compartilhado de DTOs deste modulo ainda, o front mantem Zod proprio). Schemas estritos.
import { z } from 'zod'

/** Status do numero oficial do WhatsApp (NUNCA o access_token). */
export const WhatsappOficialStatus = z.strictObject({
  configurada: z.boolean(),
  phone_number_id: z.string().nullable(),
  waba_id: z.string().nullable(),
  atualizado_em: z.string(),
})
export type WhatsappOficialStatus = z.infer<typeof WhatsappOficialStatus>

/** Set/rotate do numero oficial (write-only: o token em claro nunca volta numa resposta). */
export const WhatsappOficialEntrada = z.strictObject({
  access_token: z.string().trim().min(1).max(1000),
  phone_number_id: z.string().trim().min(1).max(100),
  waba_id: z.string().trim().min(1).max(100).nullable().default(null),
})
export type WhatsappOficialEntrada = z.infer<typeof WhatsappOficialEntrada>

/** Status da credencial de e-mail transacional (NUNCA a api key). */
export const EmailPlataformaStatus = z.strictObject({
  configurada: z.boolean(),
  remetente: z.string().nullable(),
  atualizado_em: z.string(),
})
export type EmailPlataformaStatus = z.infer<typeof EmailPlataformaStatus>

/** Set/rotate da credencial de e-mail (write-only). */
export const EmailPlataformaEntrada = z.strictObject({
  api_key: z.string().trim().min(1).max(500),
  remetente: z.string().trim().min(3).max(200),
})
export type EmailPlataformaEntrada = z.infer<typeof EmailPlataformaEntrada>
