import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  buscarPessoaBody,
  buscarPessoaResposta,
  pessoaCombinadosResposta,
  pessoaResumoResposta,
} from '@whaviso/shared/contracts'
import { z } from 'zod'
import * as service from './service'

// E15: a pessoa é referenciada por um id de COMBINADO (UUID), nunca pelo telefone (H13.8):
// a api resolve o telefone da outra ponta no servidor. Isolamento por req.userId.
const idParam = z.object({ avisoId: z.uuid() })

export const pessoasRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()

  // H15.1/H15.2: resumo da pessoa (telefone resolvido no servidor + quatro totais).
  app.get(
    '/pessoas/:avisoId/resumo',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: pessoaResumoResposta } } },
    (req) => service.resumo(app.pool, req.userId, req.params.avisoId),
  )

  // H15.3: combinados da pessoa (mesmo número), agrupados por nome.
  app.get(
    '/pessoas/:avisoId/combinados',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: pessoaCombinadosResposta } } },
    (req) => service.combinados(app.pool, req.userId, req.params.avisoId),
  )

  // H15.6: autocomplete ao criar. Telefone (parcial) vai no CORPO (POST), nunca em rota.
  app.post(
    '/pessoas/buscar-por-telefone',
    { preHandler: app.autenticar, schema: { body: buscarPessoaBody, response: { 200: buscarPessoaResposta } } },
    (req) => service.buscarPorTelefone(app.pool, req.userId, req.body.prefixo),
  )
}
