// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/sessao.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

import { z } from 'zod'
import { papelMembro, papelOperador } from './enums'
import { UuidSchema } from './primitivos'

// Contratos de sessao e escopo do kernel de identidade da api (F3 tenant-auth).
// Fonte unica: o front recebe estes DTOs pelo codegen. Duas identidades convivem no
// mesmo banco multi-tenant e NUNCA se misturam (ver docs/pivot/ARQUITETURA.md):
//   - membro de loja  -> escopo de loja  (WHERE loja_id = ANY(loja_ids))
//   - operador da plataforma -> escopo de operador (so metrica/billing, nunca conteudo)
// O escopo e sempre resolvido pelo servidor a partir de `membros`/`operadores`; nada
// que venha do corpo, da query ou de um claim do token pode ampliar o escopo (SEC-002).

/** Principal autenticado (apos validar o JWT), antes de resolver o escopo. */
export const SessaoDto = z
  .object({
    user_id: UuidSchema,
  })
  .strict()
export type SessaoDto = z.infer<typeof SessaoDto>

/**
 * Escopo de membro de loja. `loja_ids` e o conjunto FECHADO de lojas que o usuario
 * alcanca (ja expandido: um membro com `loja_id` NULL vira todas as lojas ativas da
 * conta). `papel_por_loja` mapeia cada loja alcancavel ao papel do usuario nela.
 * `loja_ativa` e a loja selecionada na requisicao (header/rota), sempre um elemento de
 * `loja_ids`; null quando a requisicao nao fixou uma loja.
 */
export const EscopoLoja = z
  .object({
    tipo: z.literal('loja'),
    user_id: UuidSchema,
    conta_id: UuidSchema,
    loja_ids: z.array(UuidSchema),
    papel_por_loja: z.record(UuidSchema, papelMembro),
    loja_ativa: UuidSchema.nullable(),
  })
  .strict()
export type EscopoLoja = z.infer<typeof EscopoLoja>

/** Escopo de operador da plataforma (equipe Whaviso). Nunca le conteudo de loja. */
export const EscopoOperador = z
  .object({
    tipo: z.literal('operador'),
    user_id: UuidSchema,
    papel: papelOperador,
  })
  .strict()
export type EscopoOperador = z.infer<typeof EscopoOperador>

/** Uniao discriminada pelo campo `tipo`. */
export const Escopo = z.discriminatedUnion('tipo', [EscopoLoja, EscopoOperador])
export type Escopo = z.infer<typeof Escopo>
