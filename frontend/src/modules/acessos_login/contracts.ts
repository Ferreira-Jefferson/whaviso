// Contratos Zod PROPRIOS da allowlist de login (espelham a api /v1/acessos-login; nao ha pacote
// compartilhado com o backend). Datas como string ISO.
import { z } from 'zod'

export const acessoStatus = z.enum(['pendente', 'aprovado', 'revogado'])
export type AcessoStatus = z.infer<typeof acessoStatus>

export const acessoOrigem = z.enum(['pagamento', 'admin'])
export type AcessoOrigem = z.infer<typeof acessoOrigem>

export const AcessoDTO = z.object({
  id: z.string(),
  email: z.string(),
  status: acessoStatus,
  origem: acessoOrigem,
  conta_id: z.string().nullable(),
  observacao: z.string().nullable(),
  aprovado_em: z.string().nullable(),
  boas_vindas_enviado_em: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})
export type AcessoDTO = z.infer<typeof AcessoDTO>

export const AcessosLista = z.array(AcessoDTO)

export interface AcessoAdicionar {
  email: string
  observacao?: string
}
