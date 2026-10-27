// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/caixa.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo caixa (PDV). Fonte unica; o codegen reemite para o front.
// Dinheiro sempre em centavos (inteiro). Valor de 'ajuste' pode ser negativo (correcao); os
// demais tipos sao sempre positivos. 'diferenca' (informado - calculado) tambem pode ser negativa.
import { z } from 'zod'
import { Centavos, DataHoraIso, UuidSchema } from './primitivos'

const TETO = 1_000_000_000

/** Valor assinado (para ajuste/diferenca); nunca zero numa entrada de movimento. */
export const ValorAssinado = z.number().int().gte(-TETO).lte(TETO)

export const tipoMovimentoCaixa = z.enum(['venda', 'sangria', 'suprimento', 'ajuste'])
export type TipoMovimentoCaixa = z.infer<typeof tipoMovimentoCaixa>

export const formaPagamento = z.enum(['dinheiro', 'credito', 'debito', 'pix', 'outro'])
export type FormaPagamento = z.infer<typeof formaPagamento>

export const statusCaixa = z.enum(['aberto', 'fechado'])
export type StatusCaixa = z.infer<typeof statusCaixa>

// ---- Entradas -------------------------------------------------------------------------------

export const CaixaAbrirEntrada = z.strictObject({
  saldo_inicial_centavos: Centavos.default(0),
})
export type CaixaAbrirEntrada = z.infer<typeof CaixaAbrirEntrada>

export const MovimentoEntrada = z.strictObject({
  tipo: tipoMovimentoCaixa,
  forma_pagamento: formaPagamento.optional(),
  valor_centavos: ValorAssinado,
  pedido_id: UuidSchema.optional(),
  motivo: z.string().trim().min(1).max(300).optional(),
})
export type MovimentoEntrada = z.infer<typeof MovimentoEntrada>

export const CaixaFecharEntrada = z.strictObject({
  saldo_informado_centavos: Centavos,
  observacoes: z.string().trim().min(1).max(500).optional(),
})
export type CaixaFecharEntrada = z.infer<typeof CaixaFecharEntrada>

// ---- Saidas ---------------------------------------------------------------------------------

export const CaixaSaida = z.strictObject({
  id: UuidSchema,
  status: statusCaixa,
  aberto_por_user_id: UuidSchema,
  aberto_em: DataHoraIso,
  saldo_inicial_centavos: Centavos,
  fechado_por_user_id: UuidSchema.nullable(),
  fechado_em: DataHoraIso.nullable(),
  saldo_informado_centavos: Centavos.nullable(),
  saldo_calculado_centavos: Centavos.nullable(),
  diferenca_centavos: z.number().int().nullable(),
  observacoes: z.string().nullable(),
})
export type CaixaSaida = z.infer<typeof CaixaSaida>

export const SessaoAbertaSaida = z.strictObject({
  caixa: CaixaSaida.nullable(),
})
export type SessaoAbertaSaida = z.infer<typeof SessaoAbertaSaida>

export const MovimentoSaida = z.strictObject({
  id: UuidSchema,
  caixa_id: UuidSchema,
  tipo: tipoMovimentoCaixa,
  forma_pagamento: formaPagamento.nullable(),
  valor_centavos: z.number().int(),
  pedido_id: UuidSchema.nullable(),
  motivo: z.string().nullable(),
  criado_por_user_id: UuidSchema,
  criado_em: DataHoraIso,
})
export type MovimentoSaida = z.infer<typeof MovimentoSaida>

/** Totais por forma de pagamento (so vendas); chaves ausentes = zero. */
export const TotaisPorForma = z.strictObject({
  dinheiro: Centavos,
  credito: Centavos,
  debito: Centavos,
  pix: Centavos,
  outro: Centavos,
})

export const CaixaRelatorioSaida = z.strictObject({
  caixa: CaixaSaida,
  totais_por_forma: TotaisPorForma,
  total_vendas_centavos: Centavos,
  total_suprimentos_centavos: Centavos,
  total_sangrias_centavos: Centavos,
  total_ajustes_centavos: z.number().int(),
  /** Dinheiro esperado na gaveta: saldo_inicial + suprimentos + vendas_em_dinheiro - sangrias. */
  saldo_esperado_dinheiro_centavos: Centavos,
  qtd_movimentos: z.number().int(),
  movimentos: z.array(MovimentoSaida),
})
export type CaixaRelatorioSaida = z.infer<typeof CaixaRelatorioSaida>
