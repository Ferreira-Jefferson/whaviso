// Contratos de borda do modulo estoque_itens (controle de estoque por item do cardapio).
// Fonte unica; o codegen reemite para o front. Schemas Zod estritos (SEC-081).
// Estoque e CONTAGEM (inteiro nao negativo), nunca dinheiro: nada de centavos aqui.
import { z } from 'zod'
import { UuidSchema } from './primitivos'

const Uuid = UuidSchema
// Saida de data como string nao vazia (serializacao do banco).
const DataHora = z.string().min(1)

// Contagem de estoque: inteiro nao negativo com teto defensivo contra overflow/abuso.
const Quantidade = z.number().int('quantidade deve ser inteiro').min(0).max(1_000_000)

/** Tipos de lancamento manual (a venda e interna, so pelo fluxo do pedido). */
export const TipoMovimentoEstoque = z.enum(['entrada', 'saida', 'ajuste'])
export type TipoMovimentoEstoque = z.infer<typeof TipoMovimentoEstoque>

/** Tipos possiveis de um lancamento ja gravado (inclui a venda). */
export const TipoMovimentoRegistrado = z.enum(['entrada', 'saida', 'ajuste', 'venda'])
export type TipoMovimentoRegistrado = z.infer<typeof TipoMovimentoRegistrado>

/**
 * Liga/desliga o controle e, opcionalmente, fixa a contagem.
 * `quantidade_disponivel` ausente mantem a contagem atual; `null` = ilimitado; numero = contagem.
 * Com `controla_estoque = false` a contagem e sempre zerada para NULL no servidor.
 */
export const EstoqueControleEntrada = z.strictObject({
  controla_estoque: z.boolean(),
  quantidade_disponivel: Quantidade.nullable().optional(),
})

/**
 * Lancamento manual. `entrada`/`saida` somam/subtraem `quantidade` (> 0) da contagem atual;
 * `ajuste` fixa a contagem no valor de `quantidade` (>= 0, pode zerar).
 */
export const EstoqueMovimentoEntrada = z
  .strictObject({
    tipo: TipoMovimentoEstoque,
    quantidade: Quantidade,
    motivo: z.string().trim().min(1).max(200).optional(),
  })
  .refine((m) => m.tipo === 'ajuste' || m.quantidade >= 1, {
    message: 'entrada e saida exigem quantidade maior que zero',
    path: ['quantidade'],
  })

/** Filtro da listagem: por padrao todos os itens com controle; `somente_baixos` corta pelo limiar. */
export const EstoqueBuscaEntrada = z.strictObject({
  somente_baixos: z.enum(['true', 'false']).default('false'),
  limiar: z.coerce.number().int().min(0).max(1_000_000).default(5),
})

export const EstoqueItemSaida = z.strictObject({
  id: Uuid,
  nome: z.string(),
  categoria_id: Uuid,
  controla_estoque: z.boolean(),
  quantidade_disponivel: z.number().int().nullable(),
  ativo: z.boolean(),
  atualizado_em: DataHora,
})

export const EstoqueListaSaida = z.strictObject({
  itens: z.array(EstoqueItemSaida),
})

export const EstoqueMovimentoSaida = z.strictObject({
  id: Uuid,
  item_id: Uuid,
  tipo: TipoMovimentoRegistrado,
  quantidade: z.number().int(),
  quantidade_resultante: z.number().int(),
  motivo: z.string().nullable(),
  pedido_id: Uuid.nullable(),
  criado_em: DataHora,
})

export const EstoqueMovimentosSaida = z.strictObject({
  itens: z.array(EstoqueMovimentoSaida),
})

export type EstoqueControle = z.infer<typeof EstoqueControleEntrada>
export type EstoqueMovimentoNovo = z.infer<typeof EstoqueMovimentoEntrada>
export type EstoqueBusca = z.infer<typeof EstoqueBuscaEntrada>
export type EstoqueItemDto = z.infer<typeof EstoqueItemSaida>
export type EstoqueMovimentoDto = z.infer<typeof EstoqueMovimentoSaida>
