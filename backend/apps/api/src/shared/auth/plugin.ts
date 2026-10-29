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
import type { Pool } from '@whaviso/shared/db'
import { naoAutorizado, proibido } from '../http_errors'
import { PREFIXO_CHAVE_API, resolverChaveApi, type ChaveApiResolvida } from './chave_api'
import type { Verificador } from './verificador'

export interface OpcoesAutenticar {
  verificador: Verificador
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Principal autenticado; null ate `autenticar` rodar com sucesso. */
    usuario: SessaoDto | null
    /** Preenchido so quando a credencial foi uma chave de API (nao JWT); senao null. */
    chaveApi: ChaveApiResolvida | null
  }
  interface FastifyInstance {
    autenticar: preHandlerHookHandler
  }
}

const BEARER = 'Bearer '

const plugin: FastifyPluginAsync<OpcoesAutenticar> = async (app, opcoes) => {
  app.decorateRequest('usuario', null)
  app.decorateRequest('chaveApi', null)

  app.decorate('autenticar', async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization
    if (!header || !header.startsWith(BEARER)) {
      throw naoAutorizado()
    }
    const credencial = header.slice(BEARER.length)
    if (credencial.startsWith(PREFIXO_CHAVE_API)) {
      // Chave de API: credencial alternativa, so para rotas de loja. NUNCA em rota de plataforma
      // (o dono da conta pode ser operador; a chave nao pode escalar para o console).
      const config = req.routeOptions.config as { acesso?: string }
      if (config.acesso === 'plataforma') throw proibido('Chave de API nao acessa a plataforma')
      let chave: ChaveApiResolvida | null
      try {
        chave = await resolverChaveApi((app as unknown as { pool: Pool }).pool, credencial)
      } catch {
        throw naoAutorizado('Chave de API invalida')
      }
      if (!chave) throw naoAutorizado('Chave de API invalida, revogada ou expirada')
      req.chaveApi = chave
      req.usuario = { user_id: chave.dono_user_id }
      reply.header('cache-control', 'no-store')
      return
    }
    let sub: string
    try {
      ;({ sub } = await opcoes.verificador.verificar(credencial))
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
