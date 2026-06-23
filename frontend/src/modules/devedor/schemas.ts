// Schemas Zod locais do módulo devedor (formulário de conta). pt-BR amigável.
import { z } from 'zod'
import { telefoneE164 } from '@/shared/contracts'

export const contaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome.').max(120, 'Nome muito longo.'),
  // E.164 ou null (PhoneInput emite null enquanto incompleto). Opcional aqui.
  telefone: telefoneE164.nullable(),
})
export type ContaForm = z.infer<typeof contaSchema>
