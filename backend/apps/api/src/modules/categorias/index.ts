import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  atualizarCategoriaBody,
  categoriaSchema,
  criarCategoriaBody,
  listaCategoriasResposta,
} from '@whaviso/shared/contracts'
import { z } from 'zod'
import * as service from './service'

// E16: categorias definidas pelo usuário (organização por marca/linha). Isolamento por
// req.userId; categoria nunca vai para mensagem ao devedor (só organização do dono).
const idParam = z.object({ id: z.uuid() })

export const categoriasRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  // H16.2: minhas categorias não arquivadas.
  app.get(
    '/categorias',
    { preHandler: app.autenticar, schema: { response: { 200: listaCategoriasResposta } } },
    (req) => service.listar(app.pool, req.userId),
  )

  // H16.1: criar.
  app.post(
    '/categorias',
    { preHandler: app.autenticar, schema: { body: criarCategoriaBody, response: { 201: categoriaSchema } } },
    async (req, reply) => {
      const categoria = await service.criar(app.pool, req.userId, req.body)
      reply.code(201)
      return categoria
    },
  )

  // H16.2: renomear / trocar cor / arquivar (soft-delete).
  app.patch(
    '/categorias/:id',
    {
      preHandler: app.autenticar,
      schema: { params: idParam, body: atualizarCategoriaBody, response: { 200: categoriaSchema } },
    },
    (req) => service.atualizar(app.pool, req.userId, req.params.id, req.body),
  )
}
