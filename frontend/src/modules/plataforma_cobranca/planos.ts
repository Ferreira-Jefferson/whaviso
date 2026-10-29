// Contratos Zod PROPRIOS do catalogo de planos (espelham a api; nao ha pacote compartilhado).
// Dinheiro em centavos (int). `inclui` = lista de textos livres do que o plano inclui.
import { z } from 'zod'

export const PlanoDTO = z.object({
  id: z.string(),
  nome: z.string(),
  valor_centavos: z.number().int().nonnegative(),
  inclui: z.array(z.string()),
  ativo: z.boolean(),
  /** Override da taxa de intermediacao (centavos); null = herda o padrao da plataforma. */
  taxa_intermediacao_centavos: z.number().int().nonnegative().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})
export type PlanoDTO = z.infer<typeof PlanoDTO>
export const PlanosLista = z.array(PlanoDTO)

export interface PlanoCriar {
  nome: string
  valor_centavos: number
  inclui: string[]
  ativo: boolean
  /** null (ou ausente) = herda o padrao da plataforma; numero = override (0 = sem taxa). */
  taxa_intermediacao_centavos?: number | null
}
export type PlanoPatch = Partial<PlanoCriar>

/** Taxa de intermediacao PADRAO da plataforma (fallback de todos os planos). */
export const ConfigTaxa = z.object({
  taxa_intermediacao_padrao_centavos: z.number().int().nonnegative(),
  atualizado_em: z.string(),
})
export type ConfigTaxa = z.infer<typeof ConfigTaxa>
