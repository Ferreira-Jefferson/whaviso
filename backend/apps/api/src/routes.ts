// Registry de módulos: 1 linha por feature. Deletar uma feature = rm -rf + 1 linha aqui.
import type { FastifyPluginAsync } from 'fastify'
import { perfilRoutes } from './modules/perfil'
import { avisosRoutes } from './modules/avisos'
import { authRoutes } from './modules/auth'
import { acoesDevedorRoutes } from './modules/acoes_devedor'
import { recebimentosRoutes } from './modules/recebimentos'
import { painelRoutes } from './modules/painel'
import { adminRoutes } from './modules/admin'
import { billingRoutes } from './modules/billing'

export const registrarModulos: FastifyPluginAsync = async (app) => {
  await app.register(perfilRoutes)
  await app.register(avisosRoutes)
  await app.register(authRoutes)
  await app.register(acoesDevedorRoutes)
  await app.register(recebimentosRoutes)
  await app.register(painelRoutes)
  await app.register(adminRoutes)
  await app.register(billingRoutes)
}
