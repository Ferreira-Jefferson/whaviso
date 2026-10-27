// Ajudantes de rota: loja do escopo (nunca do corpo) e pre-handlers por papel.
import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { regraNegocio } from '../../shared/http_errors'

export function lojaDoEscopo(req: FastifyRequest): string {
  const loja = req.escopo?.loja_ativa
  if (!loja) throw regraNegocio('loja_ativa_obrigatoria', 'Informe a loja ativa no header x-loja-id')
  return loja
}

export const ACESSO = { acesso: 'conteudo_de_loja' as const }

/** Leitura: qualquer membro da loja ativa. */
export function aoLer(app: FastifyInstance): preHandlerHookHandler[] {
  return [app.autenticar, app.escopoLoja]
}
/** Estrutura do cardapio: gerente e dono (permissao loja:gerir). */
export function aoEditar(app: FastifyInstance): preHandlerHookHandler[] {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')]
}
/** Disponibilidade: rotina de salao, inclui atendente (permissao pedidos:gerir). */
export function aoLigarDesligar(app: FastifyInstance): preHandlerHookHandler[] {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')]
}
