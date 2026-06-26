import type { FastifyPluginAsync } from 'fastify'
import {
  ativarAvisoBody,
  avisoSchema,
  criarAvisoBody,
  criarAvisoResposta,
  editarAvisoBody,
  listarAvisosQuery,
  listaEnviosResposta,
  listaEventosResposta,
  listaOcorrenciasResposta,
} from '@whaviso/shared/contracts'
import { z } from 'zod'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import * as service from './service'

const idParam = z.object({ id: z.uuid() })

export const avisosRoutes: FastifyPluginAsync = async (raiz) => {
  const app = raiz.withTypeProvider<ZodTypeProvider>()
  app.post(
    '/avisos',
    { preHandler: app.autenticar, schema: { body: criarAvisoBody, response: { 201: criarAvisoResposta } } },
    async (req, reply) => {
      const r = await service.criarAviso(app.pool, req.userId, req.body, app.env.WHAVISO_WHATSAPP)
      return reply.status(201).send(r)
    },
  )

  // H4.3: ativar uma anotação da agenda (sem_aviso -> aguardando_aceite): gera o
  // convite, consome vaga de ativo, pede dado faltante. Resposta = formato da criação.
  app.post(
    '/avisos/:id/ativar',
    { preHandler: app.autenticar, schema: { params: idParam, body: ativarAvisoBody, response: { 200: criarAvisoResposta } } },
    async (req) =>
      service.ativarAviso(app.pool, req.userId, req.params.id, req.body, app.env.WHAVISO_WHATSAPP),
  )

  // H4.5: marcar pago MANUAL de uma anotação da agenda (sem_aviso -> pago), terminal.
  app.post(
    '/avisos/:id/marcar-pago-agenda',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: avisoSchema } } },
    async (req) => service.marcarPagoAgenda(app.pool, req.userId, req.params.id),
  )

  // H2.5: editar (livre antes do aceite; com reaprovação depois).
  app.patch(
    '/avisos/:id',
    { preHandler: app.autenticar, schema: { params: idParam, body: editarAvisoBody, response: { 200: avisoSchema } } },
    async (req) => service.editarAviso(app.pool, req.userId, req.params.id, req.body),
  )

  // H2.5: desfazer a edição enquanto está em reaprovação (volta às condições anteriores).
  app.post(
    '/avisos/:id/desfazer-edicao',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: avisoSchema } } },
    async (req) => service.desfazerEdicao(app.pool, req.userId, req.params.id),
  )

  // H2.7: pausar / reativar um combinado aceito.
  app.post(
    '/avisos/:id/pausar',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: avisoSchema } } },
    async (req) => service.pausarAviso(app.pool, req.userId, req.params.id),
  )
  app.post(
    '/avisos/:id/reativar',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: avisoSchema } } },
    async (req) => service.reativarAviso(app.pool, req.userId, req.params.id),
  )

  app.get(
    '/avisos',
    { preHandler: app.autenticar, schema: { querystring: listarAvisosQuery } },
    async (req) => service.listarAvisos(app.pool, req.userId, req.query),
  )

  app.get(
    '/avisos/:id',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: avisoSchema } } },
    async (req) => service.detalharAviso(app.pool, req.userId, req.params.id),
  )

  app.post(
    '/avisos/:id/cancelar',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: avisoSchema } } },
    async (req) => service.cancelarAviso(app.pool, req.userId, req.params.id),
  )

  // Arquiva uma anotação da agenda (H11.4): sai da contagem/visão, sem DELETE físico.
  app.post(
    '/avisos/:id/arquivar',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: avisoSchema } } },
    async (req) => service.arquivarAviso(app.pool, req.userId, req.params.id),
  )

  app.get(
    '/avisos/:id/envios',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: listaEnviosResposta } } },
    async (req) => service.listarEnvios(app.pool, req.userId, req.params.id),
  )

  app.get(
    '/avisos/:id/eventos',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: listaEventosResposta } } },
    async (req) => service.listarEventos(app.pool, req.userId, req.params.id),
  )

  // E8 H8.7 / E9 H9.6: ocorrências do recorrente (k de N). Simples devolve [].
  app.get(
    '/avisos/:id/ocorrencias',
    { preHandler: app.autenticar, schema: { params: idParam, response: { 200: listaOcorrenciasResposta } } },
    async (req) => service.listarOcorrencias(app.pool, req.userId, req.params.id),
  )
}
