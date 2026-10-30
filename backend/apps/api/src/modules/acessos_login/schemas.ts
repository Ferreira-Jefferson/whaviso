// Contratos de borda do modulo acessos_login (allowlist de login). DTOs locais ao modulo;
// o front tem contratos Zod proprios espelhando estes. Datas como string ISO (UTC).
import { z } from 'zod'

export const acessoStatus = z.enum(['pendente', 'aprovado', 'revogado'])
export type AcessoStatus = z.infer<typeof acessoStatus>

export const acessoOrigem = z.enum(['pagamento', 'admin'])
export type AcessoOrigem = z.infer<typeof acessoOrigem>

/** Linha da allowlist como o operador a enxerga. Sem user ids (aprovado_por/criado_por) na borda. */
export const AcessoDTO = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  status: acessoStatus,
  origem: acessoOrigem,
  conta_id: z.uuid().nullable(),
  observacao: z.string().nullable(),
  aprovado_em: z.string().nullable(),
  boas_vindas_enviado_em: z.string().nullable(),
  criado_em: z.string(),
  atualizado_em: z.string(),
})
export type AcessoDTO = z.infer<typeof AcessoDTO>

export const AcessosLista = z.array(AcessoDTO)

export const AcessosQuery = z.strictObject({ status: acessoStatus.optional() })
export type AcessosQuery = z.infer<typeof AcessosQuery>

export const AcessoAdicionar = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(254),
  observacao: z.string().trim().max(500).optional(),
})
export type AcessoAdicionar = z.infer<typeof AcessoAdicionar>

export const IdParams = z.strictObject({ id: z.uuid() })

/**
 * Elegibilidade do PROPRIO usuario autenticado (sonda da porta de entrada do painel):
 * - `ativo`: e-mail aprovado na allowlist (pode entrar; cria a propria loja depois).
 * - `pendente`: e-mail cadastrado, aguardando pagamento/aprovacao (mensagem distinta no login).
 * - `revogado`: acesso revogado.
 * - `nao_cadastrado`: e-mail autenticado nao esta na allowlist.
 */
export const elegibilidadeEstado = z.enum(['ativo', 'pendente', 'revogado', 'nao_cadastrado'])
export type ElegibilidadeEstado = z.infer<typeof elegibilidadeEstado>

export const MinhaElegibilidade = z.strictObject({ estado: elegibilidadeEstado })
export type MinhaElegibilidade = z.infer<typeof MinhaElegibilidade>
