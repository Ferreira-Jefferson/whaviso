// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/plataforma_clientes.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo plataforma_clientes (console do operador: restaurantes como
// clientes da Whaviso). Fonte unica; o codegen reemite para o front. Schemas Zod estritos
// (SEC-081). O operador ve metadado e saude agregada, NUNCA conteudo de loja (conversa, pedido,
// cliente final, endereco) nem contato (telefone/e-mail). Dinheiro em centavos.
import { z } from 'zod'
import { papelMembro, papelOperador, statusAssinatura, statusNumero } from './enums'
import { Centavos, DataHoraIso, UuidSchema } from './primitivos'

/** Situacao de cobranca exibida na lista: status da ultima assinatura ou `sem_assinatura`. */
export const plataformaSituacaoConta = z.enum([...statusAssinatura.options, 'sem_assinatura'])
export type PlataformaSituacaoConta = z.infer<typeof plataformaSituacaoConta>

/** Saude basica do WhatsApp da conta, derivada so de status/verificado (nunca o numero). */
export const plataformaSaudeWhatsapp = z.enum(['ok', 'atencao', 'sem_numero'])
export type PlataformaSaudeWhatsapp = z.infer<typeof plataformaSaudeWhatsapp>

// ------------------------------------------------------------------ consulta
/** Busca por nome da conta/loja: minimo 2 caracteres; `%` e `_` sao tratados como literais. */
export const PlataformaContasQuery = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  busca: z.string().trim().min(2).max(80).optional(),
  situacao: plataformaSituacaoConta.optional(),
})
export type PlataformaContasQuery = z.infer<typeof PlataformaContasQuery>

// ------------------------------------------------------------------ contas
export const PlataformaContaResumo = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  criado_em: DataHoraIso,
  situacao: plataformaSituacaoConta,
  qtd_lojas: z.number().int().nonnegative(),
  qtd_lojas_ativas: z.number().int().nonnegative(),
  saude_whatsapp: plataformaSaudeWhatsapp,
})
export type PlataformaContaResumo = z.infer<typeof PlataformaContaResumo>

export const PlataformaContaPagina = z.strictObject({
  itens: z.array(PlataformaContaResumo),
  proximoCursor: z.string().nullable(),
})
export type PlataformaContaPagina = z.infer<typeof PlataformaContaPagina>

export const PlataformaNumeroSaude = z.strictObject({
  status: statusNumero,
  verificado: z.boolean(),
  criado_em: DataHoraIso,
})

export const PlataformaLojaResumo = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  ativo: z.boolean(),
  criado_em: DataHoraIso,
  /** Numero WhatsApp mais recente nao removido da loja; so status, nunca o numero. */
  numero: PlataformaNumeroSaude.nullable(),
})
export type PlataformaLojaResumo = z.infer<typeof PlataformaLojaResumo>

/** Membro sem contato: so papel e ids opacos. */
export const PlataformaMembroResumo = z.strictObject({
  user_id: UuidSchema,
  papel: papelMembro,
  /** null = acesso a todas as lojas da conta. */
  loja_id: UuidSchema.nullable(),
  ativo: z.boolean(),
  criado_em: DataHoraIso,
})

/** Assinatura (somente leitura aqui; transicoes moram em P-cobranca). */
export const PlataformaAssinaturaResumo = z.strictObject({
  id: UuidSchema,
  loja_id: UuidSchema.nullable(),
  status: statusAssinatura,
  valor_mensal_centavos: Centavos,
  dia_vencimento: z.number().int().min(1).max(28),
  trial_ate: DataHoraIso.nullable(),
  inicio_em: DataHoraIso.nullable(),
  cancelada_em: DataHoraIso.nullable(),
})

export const PlataformaContaFicha = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  criado_em: DataHoraIso,
  dono_user_id: UuidSchema,
  situacao: plataformaSituacaoConta,
  saude_whatsapp: plataformaSaudeWhatsapp,
  lojas: z.array(PlataformaLojaResumo),
  membros: z.array(PlataformaMembroResumo),
  assinatura: PlataformaAssinaturaResumo.nullable(),
})
export type PlataformaContaFicha = z.infer<typeof PlataformaContaFicha>

// ------------------------------------------------------------------ operadores (equipe Whaviso)
export const OperadorDTO = z.strictObject({
  id: UuidSchema,
  user_id: UuidSchema,
  nome: z.string(),
  papel: papelOperador,
  ativo: z.boolean(),
  criado_em: DataHoraIso,
})
export type OperadorDTO = z.infer<typeof OperadorDTO>

export const OperadorListaSaida = z.strictObject({ itens: z.array(OperadorDTO) })

/** Vincula um usuario do Auth ja existente a equipe (nunca promove um membro por outro caminho). */
export const OperadorConvite = z.strictObject({
  user_id: UuidSchema,
  nome: z.string().trim().min(1).max(120),
  papel: papelOperador.default('operador'),
})
export type OperadorConvite = z.infer<typeof OperadorConvite>

export const OperadorPatch = z
  .strictObject({
    papel: papelOperador.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })
export type OperadorPatch = z.infer<typeof OperadorPatch>
