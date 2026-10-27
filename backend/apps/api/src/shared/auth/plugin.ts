// Plugin Fastify de autenticacao (F3, etapa 5). Le `Authorization: Bearer`, verifica o
// JWT por JWKS e anexa `request.usuario = { user_id }`. 401 com envelope padrao em
// qualquer falha. O token NUNCA e logado.
//
// Plugin PURO (`fastify-plugin`): F4 (api-core) registra, injetando o `Verificador`.
// Expoe o preHandler `autenticar` para as rotas consumirem.
import fp from 'fastify-plugin'
import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify'
import type { SessaoDto } from '@whaviso/shared/contracts'
import { naoAutorizado } from '../http_errors'
import type { Verificador } from './verificador'

export interface OpcoesAutenticar {
  verificador: Verificador
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Principal autenticado; null ate `autenticar` rodar com sucesso. */
    usuario: SessaoDto | null
  }
  interface FastifyInstance {
    autenticar: preHandlerHookHandler
  }
}

const BEARER = 'Bearer '

const plugin: FastifyPluginAsync<OpcoesAutenticar> = async (app, opcoes) => {
  app.decorateRequest('usuario', null)

  app.decorate('autenticar', async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization
    if (!header || !header.startsWith(BEARER)) {
      throw naoAutorizado()
    }
    let sub: string
    try {
      ;({ sub } = await opcoes.verificador.verificar(header.slice(BEARER.length)))
    } catch {
      // Nao logamos o token nem o erro bruto; a verificacao ja neutralizou o detalhe.
      throw naoAutorizado('Token invalido ou expirado')
    }
    req.usuario = { user_id: sub }
    // Resposta autenticada carrega dado de conta: nunca cachear (proxy/browser).
    reply.header('cache-control', 'no-store')
  })
}

export const autenticarPlugin = fp(plugin, { name: 'whaviso-autenticar' })
