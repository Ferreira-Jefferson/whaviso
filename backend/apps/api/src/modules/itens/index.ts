import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { buscarItemBody, buscarItemResposta } from '@whaviso/shared/contracts'
import * as service from './service'

// Autocomplete do nome do item ao montar o pedido: sugere descrições de itens já usadas pelo
// criador. O termo vai no CORPO de um POST (consistência com pessoas/buscar-por-telefone;
// corpo não é logado pelo Fastify). Isolamento por req.userId. Lê a tabela avisos (itens jsonb)
// sem importar o módulo avisos (fronteira do lint).
export const itensRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  app.post(
    '/itens/buscar-por-nome',
    { preHandler: app.autenticar, schema: { body: buscarItemBody, response: { 200: buscarItemResposta } } },
    (req) => service.buscarPorNome(app.pool, req.userId, req.body.prefixo),
  )
}
