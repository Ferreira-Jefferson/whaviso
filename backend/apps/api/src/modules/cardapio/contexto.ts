// Ajudantes de rota: loja do escopo (nunca do corpo) e pre-handlers por papel.
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { regraNegocio } from '../../shared/http_errors'

export function lojaDoEscopo(req: FastifyRequest): string {
  const loja = req.escopo?.loja_ativa
  if (!loja) throw regraNegocio('loja_ativa_obrigatoria', 'Informe a loja ativa no header x-loja-id')
  return loja
}

export const ACESSO = { acesso: 'conteudo_de_loja' as const }

/** Leitura: `cardapio:ver` (padrao: todo membro da loja, inclusive convidado). */
export function aoLer(app: FastifyInstance): preHandlerHookHandler[] {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('cardapio:ver', { lojaAusente: 'obrigatoria' })]
}
/** Estrutura do cardapio: `cardapio:gerir` (padrao: gerente e dono). */
export function aoEditar(app: FastifyInstance): preHandlerHookHandler[] {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('cardapio:gerir')]
}
/** Disponibilidade: rotina de salao, `cardapio:disponibilidade` (padrao: inclui atendente). */
export function aoLigarDesligar(app: FastifyInstance): preHandlerHookHandler[] {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('cardapio:disponibilidade')]
}
