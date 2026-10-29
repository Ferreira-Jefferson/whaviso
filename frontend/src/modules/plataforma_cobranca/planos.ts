// Contratos Zod PROPRIOS do catalogo de planos (espelham a api; nao ha pacote compartilhado).
// Dinheiro em centavos (int). `inclui` = lista de textos livres do que o plano inclui.
import { z } from 'zod'

export const PlanoDTO = z.object({
  id: z.string(),
  nome: z.string(),
  valor_centavos: z.number().int().nonnegative(),
  inclui: z.array(z.string()),
  ativo: z.boolean(),
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
}
export type PlanoPatch = Partial<PlanoCriar>
