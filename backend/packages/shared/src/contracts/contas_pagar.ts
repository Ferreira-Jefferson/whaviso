// Contratos de borda do modulo contas a pagar: LANCAMENTOS MANUAIS (o que a loja paga a fornecedor
// ou a pessoa nao-motoboy). Fonte unica; o codegen reemite para o front. Schemas estritos (SEC-081).
// A loja efetiva vem do ESCOPO (x-loja-id), nunca do corpo/query (SEC-002). Dinheiro em centavos;
// dias (`YYYY-MM-DD`) em America/Sao_Paulo; instantes em ISO UTC.
//
// O acerto do motoboy NAO passa por aqui (e derivado das entregas, no proprio modulo). Este contrato
// e so para o pagavel DIGITADO na mao.
import { z } from 'zod'
import { UuidSchema } from './primitivos'
import { credorTipo, statusContaPagar } from './enums'

/** Dia de negocio America/Sao_Paulo, `YYYY-MM-DD`. */
const Dia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
const ValorPagavel = z.number().int().min(1).max(1_000_000_000)
const ChaveIdempotencia = z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/)

/** credor_id = fornecedor_id ou pessoa_id, conforme credor_tipo (a api casa com a FK certa). */
export const ContaPagarEntrada = z.strictObject({
  credor_tipo: credorTipo,
  credor_id: UuidSchema,
  descricao: z.string().min(1).max(200),
  valor_centavos: ValorPagavel,
  vencimento: Dia.optional(),
  competencia: Dia.optional(),
  chave_idempotencia: ChaveIdempotencia.optional(),
})
export type ContaPagarNovo = z.input<typeof ContaPagarEntrada>

export const ContaPagarAtualizarEntrada = z
  .strictObject({
    descricao: z.string().min(1).max(200).optional(),
    valor_centavos: ValorPagavel.optional(),
    vencimento: Dia.nullable().optional(),
    competencia: Dia.nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })
export type ContaPagarPatch = z.input<typeof ContaPagarAtualizarEntrada>

export const ContaPagarListaQuery = z.strictObject({
  credor_tipo: credorTipo.optional(),
  status: statusContaPagar.optional(),
  de: Dia.optional(),
  ate: Dia.optional(),
})

export const ContaPagarSaida = z.strictObject({
  id: UuidSchema,
  credor_tipo: credorTipo,
  credor_id: UuidSchema,
  credor_nome: z.string(),
  descricao: z.string(),
  valor_centavos: z.number().int(),
  vencimento: Dia.nullable(),
  competencia: Dia.nullable(),
  status: statusContaPagar,
  pago_em: z.string().nullable(),
  criado_em: z.string().min(1),
})
export type ContaPagarDto = z.infer<typeof ContaPagarSaida>

export const ContaPagarListaSaida = z.strictObject({ itens: z.array(ContaPagarSaida) })

/** POST /contas-pagar/:id/pagar: envia o total visto; a api recusa (409) se divergiu. */
export const PagarContaEntrada = z.strictObject({ valor_centavos: z.number().int() })
