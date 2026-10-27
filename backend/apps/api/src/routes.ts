// Registry de módulos: 1 linha por feature. Deletar uma feature = rm -rf + 1 linha aqui.
// Vazio no esqueleto da fundação; cada módulo API-* registra a sua rota aqui (ver historias/).
import type { FastifyPluginAsync } from 'fastify'

export const registrarModulos: FastifyPluginAsync = async () => {
  // API-* registram aqui: await app.register(xxxRoutes)
}
