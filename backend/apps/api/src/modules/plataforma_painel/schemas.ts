import { z } from 'zod'
// Contratos de borda do modulo plataforma_painel. Fonte unica: contracts/plataforma_painel
// (o codegen reemite para o front). Reexport pelo barrel `@whaviso/shared/contracts`.
export { PainelSerieQuery, PainelResumo, PainelSerie, PainelSerieMes } from '@whaviso/shared/contracts'
export type {
  PainelSerieQuery as SerieQuery,
  PainelResumo as Resumo,
  PainelSerie as Serie,
  PainelSerieMes as SerieMes,
} from '@whaviso/shared/contracts'

/** Identidade do operador (fato: vinculo ativo em `operadores`), independente da grade editavel. */
export const OperadorEu = z.object({ operador: z.literal(true), papel: z.string() })
