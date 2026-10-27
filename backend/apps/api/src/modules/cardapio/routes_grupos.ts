// Rotas de grupos de opcoes e opcoes. Loja SEMPRE do escopo; nunca do corpo/query.
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ACESSO, aoEditar, aoLer, lojaDoEscopo } from './contexto'
import {
  GrupoAtualizar,
  GrupoCriar,
  GrupoMutacaoSaida,
  GruposSaida,
  OpcaoAtualizar,
  OpcaoCriar,
  OpcaoMutacaoSaida,
  ParamId,
  ReordenarEntrada,
} from './schemas'
import {
  atualizarGrupo,
  atualizarOpcao,
  criarGrupo,
  criarOpcao,
  listarGruposComOpcoes,
  reordenarGrupos,
  reordenarOpcoesDoGrupo,
} from './service_grupos'

const Ok = z.strictObject({ ok: z.literal(true) })

export async function rotasGrupos(instancia: FastifyInstance): Promise<void> {
  const app = instancia.withTypeProvider<ZodTypeProvider>()

  app.get(
    '/grupos',
    { config: ACESSO, preHandler: aoLer(app), schema: { response: { 200: GruposSaida } } },
    async (req) => ({ grupos: await listarGruposComOpcoes(app.pool, lojaDoEscopo(req)) }),
  )

  app.post(
    '/grupos',
    { config: ACESSO, preHandler: aoEditar(app), schema: { body: GrupoCriar, response: { 201: GrupoMutacaoSaida } } },
    async (req, reply) => {
      const g = await criarGrupo(app.pool, lojaDoEscopo(req), req.body)
      return reply.status(201).send(g)
    },
  )

  app.put(
    '/grupos/ordem',
    { config: ACESSO, preHandler: aoEditar(app), schema: { body: ReordenarEntrada, response: { 200: Ok } } },
    async (req) => {
      await reordenarGrupos(app.pool, lojaDoEscopo(req), req.body.ids)
      return { ok: true as const }
    },
  )

  app.patch(
    '/grupos/:id',
    {
      config: ACESSO,
      preHandler: aoEditar(app),
      schema: { params: ParamId, body: GrupoAtualizar, response: { 200: GrupoMutacaoSaida } },
    },
    async (req) => atualizarGrupo(app.pool, lojaDoEscopo(req), req.params.id, req.body),
  )

  app.post(
    '/grupos/:id/opcoes',
    {
      config: ACESSO,
      preHandler: aoEditar(app),
      schema: { params: ParamId, body: OpcaoCriar, response: { 201: OpcaoMutacaoSaida } },
    },
    async (req, reply) => {
      const o = await criarOpcao(app.pool, lojaDoEscopo(req), req.params.id, req.body)
      return reply.status(201).send(o)
    },
  )

  app.put(
    '/grupos/:id/opcoes/ordem',
    {
      config: ACESSO,
      preHandler: aoEditar(app),
      schema: { params: ParamId, body: ReordenarEntrada, response: { 200: Ok } },
    },
    async (req) => {
      await reordenarOpcoesDoGrupo(app.pool, lojaDoEscopo(req), req.params.id, req.body.ids)
      return { ok: true as const }
    },
  )

  app.patch(
    '/opcoes/:id',
    {
      config: ACESSO,
      preHandler: aoEditar(app),
      schema: { params: ParamId, body: OpcaoAtualizar, response: { 200: OpcaoMutacaoSaida } },
    },
    async (req) => atualizarOpcao(app.pool, lojaDoEscopo(req), req.params.id, req.body),
  )
}
