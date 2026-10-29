// Contratos de borda do modulo acessos (locais). O corpo NUNCA carrega loja_id/conta_id: a
// grade e global. Estritos (SEC-081).
import { z } from 'zod'

export const EscopoAcessoSchema = z.enum(['console', 'loja'])

export const CelulaPatch = z.strictObject({
  escopo: EscopoAcessoSchema,
  papel: z.string().trim().min(1).max(30),
  permissao: z.string().trim().min(1).max(80),
  permitido: z.boolean(),
})
export type CelulaPatch = z.infer<typeof CelulaPatch>

export const PermissaoDTO = z.strictObject({
  chave: z.string(),
  escopo: EscopoAcessoSchema,
  rotulo: z.string(),
  ordem: z.number().int(),
  /** true = so o papel fixo pode ter (nao delegavel). */
  travada: z.boolean(),
})

export const CelulaDTO = z.strictObject({
  escopo: EscopoAcessoSchema,
  papel: z.string(),
  permissao: z.string(),
  permitido: z.boolean(),
})

export const AcessosSaida = z.strictObject({
  permissoes: z.array(PermissaoDTO),
  papeis: z.strictObject({ console: z.array(z.string()), loja: z.array(z.string()) }),
  /** Papel sempre-tudo por escopo (nao editavel). */
  fixos: z.strictObject({ console: z.string(), loja: z.string() }),
  grade: z.array(CelulaDTO),
})
export type AcessosSaida = z.infer<typeof AcessosSaida>

/** Permissoes de loja que o usuario logado tem em cada loja do seu escopo (so as que ele tem). */
export const MinhasPermissoesSaida = z.strictObject({
  por_loja: z.record(z.string(), z.array(z.string())),
})
export type MinhasPermissoesSaida = z.infer<typeof MinhasPermissoesSaida>
