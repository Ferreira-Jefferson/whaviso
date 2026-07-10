// Schema Zod do formulário de criar aviso. Valida contra os contratos da api
// (centavos int, E.164, data YYYY-MM-DD) com mensagens amigáveis pt-BR.
//
// Dois fluxos, ambos com combinado/aceite pelo WhatsApp:
//  - receber: mando o combinado ao DEVEDOR (nome_devedor + telefone_devedor). O Pix é meu.
//  - pagar (invertido): EU sou o devedor e mando o combinado ao COBRADOR (nome_devedor agora
//    é o nome da pessoa que vou pagar + telefone_devedor é o WhatsApp dela). O Pix
//    é dela (posso pré-preencher). Telefone obrigatório nos DOIS (vai o combinado).
import { z } from 'zod'
import { telefoneE164 } from '@/shared/contracts'

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

// "Sobre o quê" é um rótulo curto do combinado, não uma descrição. Limitamos os
// caracteres (cabe ~10 palavras) para manter as mensagens do WhatsApp enxutas.
// O backend tolera até 120; aqui é mais estrito de propósito.
export const MAX_MOTIVO_CARACTERES = 50

export const novoAvisoSchema = z
  .object({
    direcao: z.enum(['receber', 'pagar']),
    // H4.1: `enviar` envia o combinado agora; `agenda` só anota (nasce sem_aviso, sem
    // envio). No modo agenda telefone e Pix são opcionais (cobrados só ao ativar).
    modo: z.enum(['enviar', 'agenda']),
    nome_devedor: z
      .string()
      .trim()
      .min(1, 'Informe o nome de quem combinou.')
      .max(120, 'Nome muito longo.'),
    // Valor em CENTAVOS, emitido pelo MoneyInput; nunca parseFloat manual.
    valor_centavos: z
      .number({ error: 'Informe o valor combinado.' })
      .int()
      .positive('O valor precisa ser maior que zero.'),
    motivo: z
      .string()
      .trim()
      .min(3, 'Descreva o combinado em poucas palavras.')
      .max(MAX_MOTIVO_CARACTERES, `Use no máximo ${MAX_MOTIVO_CARACTERES} caracteres.`),
    data_combinada: z
      .string()
      .regex(DATA_ISO, 'Escolha a data do combinado.'),
    // E.164 ou null (PhoneInput emite null enquanto incompleto). Alvo do combinado.
    telefone_devedor: telefoneE164.nullable(),
    pix_chave: z.string().trim().max(140, 'Chave Pix muito longa.').optional(),
    // Titular + banco da chave (H2.1): obrigatórios no RECEBER (Pix obrigatório); no
    // invertido a chave é de terceiro e não exigimos esses dados aqui.
    pix_titular: z.string().trim().max(120, 'Nome muito longo.').optional(),
    pix_banco: z.string().trim().max(80, 'Nome muito longo.').optional(),
  })
  // No modo agenda telefone e Pix são opcionais (H4.1): só obrigatórios ao enviar.
  .refine((v) => v.modo === 'agenda' || v.telefone_devedor !== null, {
    message: 'Informe o WhatsApp para enviar o combinado.',
    path: ['telefone_devedor'],
  })
  // H2.1: Pix obrigatório no receber (chave + titular + banco). No invertido (pagar) a
  // chave é de quem recebe e fica opcional aqui (o cobrador confirma/ajusta no aceite).
  .refine((v) => v.modo === 'agenda' || v.direcao !== 'receber' || (v.pix_chave?.trim().length ?? 0) > 0, {
    message: 'A chave Pix é obrigatória.',
    path: ['pix_chave'],
  })
  .refine((v) => v.modo === 'agenda' || v.direcao !== 'receber' || (v.pix_titular?.trim().length ?? 0) > 0, {
    message: 'Informe o nome do titular da chave.',
    path: ['pix_titular'],
  })
  .refine((v) => v.modo === 'agenda' || v.direcao !== 'receber' || (v.pix_banco?.trim().length ?? 0) > 0, {
    message: 'Informe o banco da chave.',
    path: ['pix_banco'],
  })

export type NovoAvisoForm = z.infer<typeof novoAvisoSchema>
