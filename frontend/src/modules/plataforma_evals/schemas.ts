// Contratos proprios do front que nao vem do gerador: loja-alvo (seletor da execucao) e o filtro
// de execucoes. Espelham a api (modulo plataforma_evals); nao importam o pacote do backend.
import { z } from 'zod'

export const LojaAlvo = z.object({ id: z.uuid(), nome: z.string() })
export type LojaAlvo = z.infer<typeof LojaAlvo>

export const LojaAlvoLista = z.array(LojaAlvo)
export type LojaAlvoLista = z.infer<typeof LojaAlvoLista>
