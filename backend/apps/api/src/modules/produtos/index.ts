import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  atualizarProdutoBody,
  criarProdutoBody,
  listaProdutosResposta,
  produtoSchema,
} from '@whaviso/shared/contracts'
import { z } from 'zod'
import * as service from './service'

// E17: catálogo de produtos do dono (nome + preço de venda). Isolamento por req.userId;
// produto nunca vai para mensagem ao devedor (só organização/composição interna do pedido).
const idParam = z.object({ id: z.uuid() })

export const produtosRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  // H17.2: meus produtos não arquivados.
  app.get(
    '/produtos',
    { preHandler: app.autenticar, schema: { response: { 200: listaProdutosResposta } } },
    (req) => service.listar(app.pool, req.userId),
  )

  // H17.1: criar.
  app.post(
    '/produtos',
    { preHandler: app.autenticar, schema: { body: criarProdutoBody, response: { 201: produtoSchema } } },
    async (req, reply) => {
      const produto = await service.criar(app.pool, req.userId, req.body)
      reply.code(201)
      return produto
    },
  )

  // H17.2/H17.3/H17.4: renomear (propaga o rótulo) / trocar preço (não propaga) / arquivar.
  app.patch(
    '/produtos/:id',
    {
      preHandler: app.autenticar,
      schema: { params: idParam, body: atualizarProdutoBody, response: { 200: produtoSchema } },
    },
    (req) => service.atualizar(app.pool, req.userId, req.params.id, req.body),
  )
}
