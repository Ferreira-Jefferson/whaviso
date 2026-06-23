import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { Pool } from '@whaviso/shared/db'
import type { RoleUsuario } from '@whaviso/shared/contracts'
import { HttpError, naoAutorizado, proibido } from '../http_errors'

export interface AuthOpcoes {
  supabaseUrl: string
  pool: Pool
}

/**
 * Bloqueio de conta suspensa: 1 query indexada (pk) por id.
 * Chamado após resolver o userId: vale para TODA rota autenticada (autenticar/requireRole).
 * Rotas públicas (aceite/acao/healthz/billing/planos) não passam por aqui.
 */
export async function bloquearSeSuspenso(pool: Pool, userId: string): Promise<void> {
  const { rows } = await pool.query<{ suspenso: boolean }>(
    'select suspenso from public.profiles where id = $1',
    [userId],
  )
  if (rows[0]?.suspenso) {
    throw new HttpError(403, 'conta_suspensa', 'Conta suspensa; contate o administrador.')
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** uid do Supabase Auth; preenchido pelo preHandler `autenticar`. */
    userId: string
  }
  interface FastifyInstance {
    autenticar: preHandlerHookHandler
    /** Como `autenticar`, mas não exige sessão: se houver Bearer válido, preenche userId; senão segue anônimo. */
    autenticarOpcional: preHandlerHookHandler
    requireRole: (role: RoleUsuario) => preHandlerHookHandler
  }
}

const plugin: FastifyPluginAsync<AuthOpcoes> = async (app, opcoes) => {
  const issuer = `${opcoes.supabaseUrl}/auth/v1`
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))

  app.decorateRequest('userId', '')

  async function verificar(req: FastifyRequest): Promise<void> {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) throw naoAutorizado()
    try {
      const { payload } = await jwtVerify(header.slice('Bearer '.length), jwks, { issuer })
      if (!payload.sub) throw new Error('sem sub')
      req.userId = payload.sub
    } catch {
      throw naoAutorizado('Token inválido ou expirado')
    }
  }

  app.decorate('autenticar', async (req: FastifyRequest) => {
    await verificar(req)
    await bloquearSeSuspenso(opcoes.pool, req.userId)
  })

  // Sessão opcional: usado por rotas públicas que VINCULAM a conta quando há login
  // (ex.: aceite por link). Sem Bearer → anônimo; Bearer inválido → ignora (segue anônimo).
  app.decorate('autenticarOpcional', async (req: FastifyRequest) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return
    try {
      const { payload } = await jwtVerify(header.slice('Bearer '.length), jwks, { issuer })
      if (payload.sub) {
        req.userId = payload.sub
        await bloquearSeSuspenso(opcoes.pool, req.userId)
      }
    } catch {
      // token ruim num endpoint público: trata como anônimo (não derruba o aceite).
    }
  })

  app.decorate('requireRole', (role: RoleUsuario) => {
    return async (req: FastifyRequest) => {
      await verificar(req)
      const { rows } = await opcoes.pool.query<{ role: RoleUsuario; suspenso: boolean }>(
        'select role, suspenso from public.profiles where id = $1',
        [req.userId],
      )
      if (rows[0]?.suspenso) {
        throw new HttpError(403, 'conta_suspensa', 'Conta suspensa; contate o administrador.')
      }
      if (rows[0]?.role !== role) throw proibido()
    }
  })
}

export const authPlugin = fp(plugin, { name: 'whaviso-auth' })
