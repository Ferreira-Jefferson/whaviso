// Contratos de borda do modulo salao (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos (SEC-081). Preco NUNCA entra: so o servidor calcula a partir do
// cardapio (snapshot). Dinheiro em centavos.
import { z } from 'zod'
import { Centavos, DataHoraIso, UuidSchema } from './primitivos'
import { formaPagamento } from './caixa'

const texto = (max: number) => z.string().trim().min(1).max(max)

// ------------------------------------------------------------------ mesas (cadastro)
export const MesaCriarEntrada = z.strictObject({
  nome: texto(60),
  capacidade: z.number().int().min(1).max(999).nullable().optional(),
})
export type MesaCriarEntrada = z.infer<typeof MesaCriarEntrada>

/** PATCH parcial: capacidade pode ser limpa com null; nome e ativo nao. */
export const MesaAtualizarEntrada = z
  .strictObject({
    nome: texto(60).optional(),
    capacidade: z.number().int().min(1).max(999).nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })
export type MesaAtualizarEntrada = z.infer<typeof MesaAtualizarEntrada>

export const MesaSaida = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  capacidade: z.number().int().nullable(),
  ativo: z.boolean(),
  /** id da comanda aberta nesta mesa, se houver (mesa ocupada). */
  comanda_aberta_id: UuidSchema.nullable(),
  comanda_aberta_total_centavos: Centavos.nullable(),
  criado_em: DataHoraIso,
})
export type MesaSaida = z.infer<typeof MesaSaida>

export const MesaListaSaida = z.strictObject({ itens: z.array(MesaSaida) })

// ------------------------------------------------------------------ comandas (sessao)
export const ComandaAbrirEntrada = z.strictObject({
  mesa_id: UuidSchema,
  observacoes: texto(500).nullable().optional(),
})
export type ComandaAbrirEntrada = z.infer<typeof ComandaAbrirEntrada>

export const ComandaItemEntrada = z.strictObject({
  item_id: UuidSchema,
  quantidade: z.number().int().min(1).max(99),
})
export type ComandaItemEntrada = z.infer<typeof ComandaItemEntrada>

/**
 * Fechar a comanda (historia 07, regra 6): o recebimento entra no caixa aberto na forma de
 * pagamento usada. A forma e obrigatoria porque o valor da comanda tem que cair no caixa.
 */
export const ComandaFecharEntrada = z.strictObject({
  forma_pagamento: formaPagamento,
})
export type ComandaFecharEntrada = z.infer<typeof ComandaFecharEntrada>

export const ComandaItemSaida = z.strictObject({
  id: UuidSchema,
  item_id: UuidSchema,
  nome_item: z.string(),
  quantidade: z.number().int(),
  preco_unitario_centavos: Centavos,
  total_centavos: Centavos,
  criado_em: DataHoraIso,
})

export const comandaStatus = z.enum(['aberta', 'fechada'])
export type ComandaStatus = z.infer<typeof comandaStatus>

export const ComandaSaida = z.strictObject({
  id: UuidSchema,
  mesa_id: UuidSchema,
  mesa_nome: z.string(),
  status: comandaStatus,
  total_centavos: Centavos,
  observacoes: z.string().nullable(),
  aberta_em: DataHoraIso,
  fechada_em: DataHoraIso.nullable(),
  itens: z.array(ComandaItemSaida),
})
export type ComandaSaida = z.infer<typeof ComandaSaida>

export const ComandaListaSaida = z.strictObject({ itens: z.array(ComandaSaida) })
