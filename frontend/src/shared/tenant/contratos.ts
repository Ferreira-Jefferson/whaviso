// Contrato minimo da loja para o shell (nome, logo, cores). O DTO completo (`LojaSaida`) ainda
// nao esta em `_generated`; quando API-lojas entrar, trocar por ele (ver front-shell.md, Notas).
// Tolerante a campos extras (a api pode devolver endereco, horarios etc.).
import { z } from 'zod'
import { UuidSchema } from '../contracts/_generated'

export const LojaResumo = z.object({
  id: UuidSchema,
  nome: z.string().min(1),
  logo_url: z.string().nullish(),
  cores: z.record(z.string(), z.unknown()).nullish(),
  ativo: z.boolean().optional(),
})
export type LojaResumo = z.infer<typeof LojaResumo>

/** GET /v1/lojas: aceita lista direta ou pagina `{ itens }`. */
export const ListaLojas = z
  .union([z.array(LojaResumo), z.object({ itens: z.array(LojaResumo) })])
  .transform((v) => (Array.isArray(v) ? v : v.itens))
