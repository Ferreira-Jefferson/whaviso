// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/ficha_tecnica.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo ficha_tecnica (fonte unica; o codegen reemite para o front).
// A ficha de um item e a lista de insumos que ele consome, com a quantidade por UMA unidade
// vendida. Quantidade e decimal (numeric(14,3) no banco), sempre positiva; nunca e dinheiro.
import { z } from 'zod'
import { UuidSchema } from './primitivos'

// Quantidade consumida por 1 unidade vendida do item. Positiva, teto defensivo, ate 3 casas
// (o banco e numeric(14,3)). Nao e centavos: e quantidade fisica de insumo (kg, un, L...).
export const FichaQuantidade = z
  .number()
  .positive('quantidade deve ser maior que zero')
  .max(100_000_000, 'quantidade acima do teto')

export const FichaLinhaEntrada = z.strictObject({
  insumo_id: UuidSchema,
  quantidade: FichaQuantidade,
})
export type FichaLinhaEntrada = z.infer<typeof FichaLinhaEntrada>

// Definir/editar a ficha do item = a lista inteira de linhas (substitui a ficha vigente). Lista
// vazia zera a ficha (desativa todas as linhas). Insumo repetido na mesma lista e rejeitado.
export const FichaTecnicaEntrada = z
  .strictObject({
    linhas: z.array(FichaLinhaEntrada).max(200),
  })
  .refine((o) => new Set(o.linhas.map((l) => l.insumo_id)).size === o.linhas.length, {
    message: 'insumo_id repetido na ficha',
    path: ['linhas'],
  })
export type FichaTecnicaEntrada = z.infer<typeof FichaTecnicaEntrada>

export const FichaLinhaSaida = z.strictObject({
  insumo_id: UuidSchema,
  quantidade: z.number(),
})
export const FichaTecnicaSaida = z.strictObject({
  item_id: UuidSchema,
  linhas: z.array(FichaLinhaSaida),
})
export type FichaTecnicaSaida = z.infer<typeof FichaTecnicaSaida>
