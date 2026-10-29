// Contratos proprios do front para a equipe (com e-mail e metodo de login) e para o provisionamento
// de cliente. Espelham a api (modulo plataforma_clientes); nao importam o pacote do backend.
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

export interface NovoCliente {
  nome_restaurante: string
  email_dono: string
}

export const NovoClienteSaida = z.object({ conta_id: z.uuid(), loja_id: z.uuid() })
export type NovoClienteSaida = z.infer<typeof NovoClienteSaida>

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
