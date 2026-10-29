// Contratos Zod PROPRIOS do modulo acessos (espelham /v1/acessos da api; o front nao importa o
// pacote do backend). O corpo nunca leva loja_id: a grade e global.
import { z } from 'zod'

export const EscopoAcesso = z.enum(['console', 'loja'])
export type EscopoAcesso = z.infer<typeof EscopoAcesso>

export const PermissaoDTO = z.object({
  chave: z.string(),
  escopo: EscopoAcesso,
  rotulo: z.string(),
  ordem: z.number(),
  /** true = so o papel fixo pode ter (nao delegavel). */
  travada: z.boolean(),
})
export type PermissaoDTO = z.infer<typeof PermissaoDTO>

export const CelulaDTO = z.object({
  escopo: EscopoAcesso,
  papel: z.string(),
  permissao: z.string(),
  permitido: z.boolean(),
})
export type CelulaDTO = z.infer<typeof CelulaDTO>

export const AcessosSaida = z.object({
  permissoes: z.array(PermissaoDTO),
  papeis: z.object({ console: z.array(z.string()), loja: z.array(z.string()) }),
  fixos: z.object({ console: z.string(), loja: z.string() }),
  grade: z.array(CelulaDTO),
})
export type AcessosSaida = z.infer<typeof AcessosSaida>
