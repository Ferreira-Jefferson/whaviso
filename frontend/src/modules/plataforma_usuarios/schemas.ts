// Contratos proprios do front para a equipe (com e-mail e metodo de login) e para o cadastro de
// usuario. Espelham a api (modulo plataforma_usuarios); nao importam o pacote do backend.
import { z } from 'zod'
import { papelOperador } from '@/shared/contracts/_generated/enums'

export const metodoLogin = z.enum(['google', 'whatsapp', 'email'])
export type MetodoLogin = z.infer<typeof metodoLogin>

export const OperadorDTO = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  nome: z.string(),
  papel: papelOperador,
  ativo: z.boolean(),
  criado_em: z.iso.datetime({ offset: true }),
  email: z.string().nullable(),
  metodo: metodoLogin.nullable(),
})
export type OperadorDTO = z.infer<typeof OperadorDTO>

export const OperadorListaSaida = z.object({ itens: z.array(OperadorDTO) })
export type OperadorListaSaida = z.infer<typeof OperadorListaSaida>

export interface OperadorConvite {
  email: string
  nome: string
  papel: z.infer<typeof papelOperador>
}

/**
 * Cadastro de usuario pelo operador. Dois caminhos, mutuamente exclusivos:
 * - `loja_codigo_publico` informado: vincula o usuario (precisa ja ter entrado no Whaviso uma vez)
 *   como membro de uma loja JA cadastrada.
 * - ausente: cria uma conta nova (o usuario cria a propria loja depois); `plano_id` so se aplica
 *   aqui, associando uma assinatura inicial a conta nova.
 * `ativo` aprova o acesso de login na hora (allowlist); se falso, fica pendente de aprovacao.
 */
export interface NovoUsuario {
  nome: string
  email: string
  ativo: boolean
  loja_codigo_publico?: string
  plano_id?: string
}

export const NovoUsuarioSaida = z.object({
  conta_id: z.uuid(),
  loja_id: z.uuid().nullable(),
  membro_id: z.uuid().nullable(),
  vinculado_loja_existente: z.boolean(),
})
export type NovoUsuarioSaida = z.infer<typeof NovoUsuarioSaida>

// Chaves de API da conta (emitidas pela Whaviso). A listagem so traz a mascara; o valor completo
// vem uma unica vez, na resposta da criacao.
export const situacaoChave = z.enum(['ativa', 'expirada', 'revogada'])
export type SituacaoChave = z.infer<typeof situacaoChave>

export const ChaveApiDTO = z.object({
  id: z.uuid(),
  nome: z.string(),
  prefixo: z.string(),
  ultimos4: z.string(),
  mascara: z.string(),
  criado_em: z.iso.datetime({ offset: true }),
  expira_em: z.iso.datetime({ offset: true }).nullable(),
  revogada_em: z.iso.datetime({ offset: true }).nullable(),
  situacao: situacaoChave,
})
export type ChaveApiDTO = z.infer<typeof ChaveApiDTO>

export const ChaveApiLista = z.object({ itens: z.array(ChaveApiDTO) })
export type ChaveApiLista = z.infer<typeof ChaveApiLista>

export const ChaveApiCriada = z.object({ chave: ChaveApiDTO, valor: z.string() })
export type ChaveApiCriada = z.infer<typeof ChaveApiCriada>

export interface NovaChaveApi {
  nome: string
  /** ISO com offset; ausente = sem validade. */
  expira_em?: string
}

/** Catalogo de planos (modulo plataforma_cobranca). Espelho minimo so pro seletor aqui: modulo
 * nunca importa modulo, entao a chamada HTTP e refeita neste modulo. */
export const PlanoResumo = z.object({
  id: z.uuid(),
  nome: z.string(),
  valor_centavos: z.number().int().nonnegative(),
  ativo: z.boolean(),
})
export type PlanoResumo = z.infer<typeof PlanoResumo>
export const PlanosResumoLista = z.array(PlanoResumo)
