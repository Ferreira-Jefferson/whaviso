// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/fornecedores.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo contas a pagar: FORNECEDORES (quem a loja paga e nao e pessoa).
// Fonte unica; o codegen reemite para o front. Schemas estritos (SEC-081). A loja efetiva vem do
// ESCOPO (x-loja-id), nunca do corpo/query (SEC-002). telefone e PII: entra em claro (cadastro),
// sai so MASCARADO (ultimos 4); o claro so sai sob rota de revelar, com permissao elevada.
import { z } from 'zod'
import { UuidSchema } from './primitivos'

export const FornecedorEntrada = z.strictObject({
  nome: z.string().min(1).max(120),
  documento: z.string().min(1).max(40).optional(),
  telefone: z.string().min(1).max(30).optional(),
  observacoes: z.string().min(1).max(500).optional(),
})
export type FornecedorNovo = z.input<typeof FornecedorEntrada>

export const FornecedorAtualizarEntrada = z
  .strictObject({
    nome: z.string().min(1).max(120).optional(),
    documento: z.string().max(40).nullable().optional(),
    telefone: z.string().max(30).nullable().optional(),
    observacoes: z.string().max(500).nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })
export type FornecedorPatch = z.input<typeof FornecedorAtualizarEntrada>

export const FornecedorListaQuery = z.strictObject({
  incluir_inativos: z.enum(['true', 'false']).optional(),
})

export const FornecedorSaida = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  documento: z.string().nullable(),
  telefone_ultimos4: z.string().nullable(),
  observacoes: z.string().nullable(),
  ativo: z.boolean(),
  criado_em: z.string().min(1),
  atualizado_em: z.string().min(1),
})
export type FornecedorDto = z.infer<typeof FornecedorSaida>

export const FornecedorListaSaida = z.strictObject({ itens: z.array(FornecedorSaida) })

/** Telefone em claro: so em POST /fornecedores/:id/telefone/revelar (dono/gerente, no-store). */
export const FornecedorTelefoneSaida = z.strictObject({ telefone: z.string() })
