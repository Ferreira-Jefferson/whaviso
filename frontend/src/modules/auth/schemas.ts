// Schemas Zod locais do módulo auth (formulários). Mensagens amigáveis pt-BR.
// Login sem e-mail/senha (2026-06-17): Google OAuth + WhatsApp OTP.
import { z } from 'zod'

const TELEFONE_BR = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/

/** Passo 1 do login por WhatsApp: o telefone que vai receber o código. */
export const telefoneOtpSchema = z.object({
  telefone: z
    .string()
    .trim()
    .min(1, 'Informe seu WhatsApp.')
    .refine((v) => TELEFONE_BR.test(v), {
      message: 'Telefone inválido. Ex.: (11) 99999-8888',
    }),
})
export type TelefoneOtpForm = z.infer<typeof telefoneOtpSchema>

/** Passo 2 do login por WhatsApp: o código de 6 dígitos recebido. */
export const codigoOtpSchema = z.object({
  codigo: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Informe os 6 dígitos do código.'),
})
export type CodigoOtpForm = z.infer<typeof codigoOtpSchema>

export const onboardingSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe seu nome.')
    .max(120, 'Nome muito longo.'),
  // WhatsApp é o que liga a conta aos avisos já registrados para esse número, por isso obrigatório.
  telefone: z
    .string()
    .trim()
    .min(1, 'Informe seu WhatsApp.')
    .refine((v) => TELEFONE_BR.test(v), {
      message: 'Telefone inválido. Ex.: (11) 99999-8888',
    }),
})
export type OnboardingForm = z.infer<typeof onboardingSchema>

/** Converte um telefone digitado (BR) para E.164, ou null se vazio/curto. */
export function paraE164(bruto: string | undefined): string | null {
  if (!bruto) return null
  const digitos = bruto.replace(/\D/g, '')
  if (digitos.length < 10) return null
  return `+55${digitos}`
}
