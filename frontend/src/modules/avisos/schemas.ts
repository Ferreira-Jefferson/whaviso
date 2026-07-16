// Schema Zod do formulário de criar aviso. Valida contra os contratos da api
// (centavos int, E.164, data YYYY-MM-DD) com mensagens amigáveis pt-BR.
//
// Dois fluxos, ambos com combinado/aceite pelo WhatsApp:
//  - receber: mando o combinado ao DEVEDOR (nome_devedor + telefone_devedor). O Pix é meu.
//  - pagar (invertido): EU sou o devedor e mando o combinado ao COBRADOR (nome_devedor agora
//    é o nome da pessoa que vou pagar + telefone_devedor é o WhatsApp dela). O Pix
//    é dela (posso pré-preencher). Telefone obrigatório nos DOIS (vai o combinado).
import { z } from 'zod'
import { somaItensCentavos, telefoneE164 } from '@/shared/contracts'

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

// "Sobre o quê" é um rótulo curto do combinado, não uma descrição. Limitamos os
// caracteres (cabe ~10 palavras) para manter as mensagens do WhatsApp enxutas.
// O backend tolera até 120; aqui é mais estrito de propósito.
export const MAX_MOTIVO_CARACTERES = 50

export const novoAvisoSchema = z
  .object({
    direcao: z.enum(['receber', 'pagar']),
    // H4.1: `enviar` envia o combinado agora; `agenda` só anota (nasce sem_aviso, sem
    // envio). O WhatsApp é obrigatório nos DOIS modos (identifica a outra pessoa); só o
    // Pix é diferido no modo agenda (cobrado ao ativar).
    modo: z.enum(['enviar', 'agenda']),
    nome_devedor: z
      .string()
      .trim()
      .min(1, 'Informe o nome de quem combinou.')
      .max(120, 'Nome muito longo.'),
    // Itens do pedido: o valor do combinado é DERIVADO da soma (qtd x preço). Shape leniente
    // (só o suficiente para a soma); as mensagens são AGREGADAS num único erro em `itens` pelo
    // superRefine abaixo (a validação estrita real acontece no criarAvisoBody, no envio).
    itens: z.array(
      z.object({
        descricao: z.string(),
        qtd: z.number().int(),
        valor_unit_centavos: z.number().int(),
      }),
    ),
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
    // E16: categoria (opcional; '' = sem categoria). Nunca vai ao devedor; ajuda a organizar.
    categoria_id: z.string().optional(),
  })
  // Itens obrigatórios: >=1 item, todos com descrição, e total > 0 (uma mensagem por vez, em
  // ordem de prioridade). Vale nos dois modos (enviar e agenda): sem itens não há valor.
  .superRefine((v, ctx) => {
    if (v.itens.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['itens'], message: 'Adicione ao menos um item ao pedido.' })
      return
    }
    if (v.itens.some((i) => i.descricao.trim().length === 0)) {
      ctx.addIssue({ code: 'custom', path: ['itens'], message: 'Preencha a descrição de todos os itens.' })
      return
    }
    if (somaItensCentavos(v.itens) <= 0) {
      ctx.addIssue({ code: 'custom', path: ['itens'], message: 'O valor do pedido precisa ser maior que zero.' })
    }
  })
  // WhatsApp obrigatório SEMPRE (H4.1): é quem recebe o combinado e identifica a outra
  // pessoa, mesmo salvando na agenda. Só o Pix é diferido no modo agenda (abaixo).
  .refine((v) => v.telefone_devedor !== null, {
    message: 'Informe o WhatsApp de quem combinou.',
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
