// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/contas_pagar.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo contas a pagar: LANCAMENTOS MANUAIS (o que a loja paga a fornecedor
// ou a pessoa nao-motoboy). Fonte unica; o codegen reemite para o front. Schemas estritos (SEC-081).
// A loja efetiva vem do ESCOPO (x-loja-id), nunca do corpo/query (SEC-002). Dinheiro em centavos;
// dias (`YYYY-MM-DD`) em America/Sao_Paulo; instantes em ISO UTC.
//
// O acerto do motoboy NAO passa por aqui (e derivado das entregas, no proprio modulo). Este contrato
// e so para o pagavel DIGITADO na mao.
import { z } from 'zod'
import { UuidSchema } from './primitivos'
import {
  credorTipo, periodicidadeFixo, regimePagamento, statusContaPagar, tipoLancamento,
} from './enums'

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

// ---------------------------------------------------------------------------------------------
// Acerto do motoboy POR PERIODO (aplicando o regime de pagamento). O acerto cobre [de, ate]
// inclusivo; o total e DERIVADO do regime + ledger motoboy_lancamentos e so e congelado no
// pagamento. Dinheiro em centavos; o ajuste pode ser negativo.
// ---------------------------------------------------------------------------------------------
export const AcertoPeriodoQuery = z.strictObject({ de: Dia, ate: Dia })

/** Um lancamento do ledger (entrega automatica ou ajuste manual) dentro do periodo. */
export const AcertoLancamento = z.strictObject({
  id: z.string(),
  data: Dia,
  tipo: tipoLancamento,
  pedido_id: UuidSchema.nullable(),
  valor_centavos: z.number().int(),
  descricao: z.string().nullable(),
  criado_em: z.string().min(1),
})

/** O acerto de UM motoboy no periodo, com o breakdown por regime. */
export const AcertoMotoboyLinha = z.strictObject({
  motoboy_id: UuidSchema,
  motoboy_nome: z.string(),
  regime_pagamento: regimePagamento,
  periodicidade_fixo: periodicidadeFixo,
  valor_fixo_centavos: z.number().int(),
  qtd_entregas: z.number().int(),
  dias_trabalhados: z.number().int(),
  entregas_centavos: z.number().int(),
  /** Parcela fixa derivada no periodo (regime fixo/fixo_mais_entrega; 0 em por_entrega). */
  fixo_centavos: z.number().int(),
  ajustes_centavos: z.number().int(),
  /** Derivado: (regime inclui fixo? fixo:0) + (regime inclui entrega? entregas:0) + ajustes. */
  total_centavos: z.number().int(),
  /** true quando [de,ate] sobrepoe algum acerto ja PAGO deste motoboy (nao da para pagar de novo). */
  pago: z.boolean(),
  lancamentos: z.array(AcertoLancamento),
})

export const AcertoPeriodoSaida = z.strictObject({
  de: Dia,
  ate: Dia,
  total_centavos: z.number().int(),
  linhas: z.array(AcertoMotoboyLinha),
})

/** Ajuste manual no acerto (valor com sinal). data default hoje (SP); dia em acerto pago = 409. */
export const AcertoAjusteEntrada = z.strictObject({
  motoboy_id: UuidSchema,
  valor_centavos: z
    .number()
    .int()
    .min(-1_000_000_000)
    .max(1_000_000_000)
    .refine((v) => v !== 0, { message: 'valor nao pode ser zero' }),
  descricao: z.string().min(1).max(200),
  data: Dia.optional(),
  chave_idempotencia: ChaveIdempotencia.optional(),
})

/** Paga o periodo [de,ate] de um motoboy. total_centavos = o visto; 409 se divergir ou sobrepor pago. */
export const PagarAcertoEntrada = z.strictObject({
  motoboy_id: UuidSchema,
  de: Dia,
  ate: Dia,
  total_centavos: z.number().int(),
})

export const AcertoPagoSaida = z.strictObject({
  id: UuidSchema,
  motoboy_id: UuidSchema,
  periodo_inicio: Dia,
  periodo_fim: Dia,
  total_pago_centavos: z.number().int(),
  pago_em: z.string().min(1),
})
export type AcertoPagoDto = z.infer<typeof AcertoPagoSaida>
export type AcertoMotoboyLinhaDto = z.infer<typeof AcertoMotoboyLinha>
export type AcertoPeriodoDto = z.infer<typeof AcertoPeriodoSaida>
