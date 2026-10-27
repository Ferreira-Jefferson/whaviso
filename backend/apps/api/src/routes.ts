// Registry de módulos: 1 linha por feature. Deletar uma feature = rm -rf + 1 linha aqui.
import type { FastifyPluginAsync } from 'fastify'
import { perfilRoutes } from './modules/perfil'
import { authRoutes } from './modules/auth'
import { adminRoutes } from './modules/admin'
import { syncRoutes } from './modules/sync'

export const registrarModulos: FastifyPluginAsync = async (app) => {
  await app.register(perfilRoutes)
  await app.register(authRoutes)
  await app.register(adminRoutes)
  await app.register(syncRoutes)
}
