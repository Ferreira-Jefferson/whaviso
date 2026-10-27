// Rotas de categorias e itens (e dos vinculos de heranca/excecao). Loja SEMPRE do escopo.
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ACESSO, aoEditar, lojaDoEscopo } from './contexto'
import {
  CategoriaAtualizar,
  CategoriaCriar,
  CategoriaGruposEntrada,
  CategoriaSaida,
  ItemAtualizar,
  ItemCriar,
  ItemGruposEntrada,
  ItemMutacaoSaida,
  ItemSaida,
  ParamId,
  ReordenarEntrada,
} from './schemas'
import {
  atualizarCategoria,
  criarCategoria,
  definirGruposDaCategoria,
  reordenarCategorias,
} from './service_categorias'
import { atualizarItem, criarItem, definirExcecoesDoItem } from './service_itens'

const Ok = z.strictObject({ ok: z.literal(true) })

export async function rotasCatalogo(instancia: FastifyInstance): Promise<void> {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const editar = { config: ACESSO, preHandler: aoEditar(app) }

  app.post(
    '/categorias',
    { ...editar, schema: { body: CategoriaCriar, response: { 201: CategoriaSaida } } },
    async (req, reply) => reply.status(201).send(await criarCategoria(app.pool, lojaDoEscopo(req), req.body)),
  )
  app.put(
    '/categorias/ordem',
    { ...editar, schema: { body: ReordenarEntrada, response: { 200: Ok } } },
    async (req) => {
      await reordenarCategorias(app.pool, lojaDoEscopo(req), req.body.ids)
      return { ok: true as const }
    },
  )
  app.patch(
    '/categorias/:id',
    { ...editar, schema: { params: ParamId, body: CategoriaAtualizar, response: { 200: CategoriaSaida } } },
    async (req) => atualizarCategoria(app.pool, lojaDoEscopo(req), req.params.id, req.body),
  )
  app.put(
    '/categorias/:id/grupos',
    { ...editar, schema: { params: ParamId, body: CategoriaGruposEntrada, response: { 200: CategoriaSaida } } },
    async (req) => definirGruposDaCategoria(app.pool, lojaDoEscopo(req), req.params.id, req.body.grupos),
  )

  app.post(
    '/itens',
    { ...editar, schema: { body: ItemCriar, response: { 201: ItemMutacaoSaida } } },
    async (req, reply) => reply.status(201).send(await criarItem(app.pool, lojaDoEscopo(req), req.body)),
  )
  app.patch(
    '/itens/:id',
    { ...editar, schema: { params: ParamId, body: ItemAtualizar, response: { 200: ItemMutacaoSaida } } },
    async (req) => atualizarItem(app.pool, lojaDoEscopo(req), req.params.id, req.body),
  )
  app.put(
    '/itens/:id/grupos',
    { ...editar, schema: { params: ParamId, body: ItemGruposEntrada, response: { 200: ItemSaida } } },
    async (req) => definirExcecoesDoItem(app.pool, lojaDoEscopo(req), req.params.id, req.body.excecoes),
  )
}
