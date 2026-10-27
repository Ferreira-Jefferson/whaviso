// Contratos de borda do modulo avaliacoes (fonte unica; o codegen reemite para o front).
// Schemas Zod estritos. Datas em ISO UTC. O comentario e texto livre do consumidor (pode ter
// dado pessoal): nunca vai para log. Nenhum telefone trafega aqui (a ficha fica em clientes).
import { z } from 'zod'
import { Cursor, UuidSchema } from './primitivos'

const Uuid = UuidSchema
const DataHora = z.string().min(1)

export const Nota = z.number().int().min(1).max(5)

// ---------------------------------------------------------------- registro

export const AvaliacaoCriarEntrada = z.strictObject({
  pedido_id: Uuid,
  nota: Nota,
  comentario: z.string().trim().min(1).max(1000).optional(),
})
export type AvaliacaoNova = z.infer<typeof AvaliacaoCriarEntrada>

export const AvaliacaoSaida = z.strictObject({
  id: Uuid,
  pedido_id: Uuid,
  pedido_codigo: z.string(),
  cliente_id: Uuid,
  cliente_nome: z.string().nullable(),
  nota: Nota,
  comentario: z.string().nullable(),
  criado_em: DataHora,
})
export type AvaliacaoDto = z.infer<typeof AvaliacaoSaida>

// ---------------------------------------------------------------- lista

export const AvaliacoesEntrada = z.strictObject({
  nota: z.coerce.number().int().min(1).max(5).optional(),
  cursor: Cursor.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})
export type AvaliacoesBusca = z.infer<typeof AvaliacoesEntrada>

export const AvaliacoesSaida = z.strictObject({
  itens: z.array(AvaliacaoSaida),
  proximoCursor: z.string().nullable(),
})

// ---------------------------------------------------------------- resumo

export const AvaliacoesResumoSaida = z.strictObject({
  total: z.number().int().nonnegative(),
  /** Media das notas com 2 casas; null sem avaliacoes. */
  media: z.number().min(1).max(5).nullable(),
  distribuicao: z.strictObject({
    '1': z.number().int().nonnegative(),
    '2': z.number().int().nonnegative(),
    '3': z.number().int().nonnegative(),
    '4': z.number().int().nonnegative(),
    '5': z.number().int().nonnegative(),
  }),
})
export type AvaliacoesResumo = z.infer<typeof AvaliacoesResumoSaida>
