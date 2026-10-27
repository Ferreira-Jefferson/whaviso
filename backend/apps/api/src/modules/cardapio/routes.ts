import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { ACESSO, aoLer, aoLigarDesligar, lojaDoEscopo } from './contexto'
import { CardapioResolvidoSaida, DisponibilidadeEntrada, DisponibilidadeSaida, ParamId } from './schemas'
import { alterarDisponibilidadeItem, alterarDisponibilidadeOpcao, cardapioResolvido } from './service'
import { rotasCatalogo } from './routes_catalogo'
import { rotasGrupos } from './routes_grupos'

export const cardapioRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()

  // Arvore resolvida para o painel (inclui inativos, com flags).
  app.get(
    '/',
    { config: ACESSO, preHandler: aoLer(app), schema: { response: { 200: CardapioResolvidoSaida } } },
    async (req) => cardapioResolvido(app.pool, lojaDoEscopo(req), 'painel'),
  )
  // So o que e pedivel agora (uso de pedidos/atendente).
  app.get(
    '/publico-resolvido',
    { config: ACESSO, preHandler: aoLer(app), schema: { response: { 200: CardapioResolvidoSaida } } },
    async (req) => cardapioResolvido(app.pool, lojaDoEscopo(req), 'pedivel'),
  )

  // Ligar/desligar e "esgotado": rotina de salao, inclui atendente.
  app.post(
    '/itens/:id/disponibilidade',
    {
      config: ACESSO,
      preHandler: aoLigarDesligar(app),
      schema: { params: ParamId, body: DisponibilidadeEntrada, response: { 200: DisponibilidadeSaida } },
    },
    async (req) => alterarDisponibilidadeItem(app.pool, lojaDoEscopo(req), req.params.id, req.body),
  )
  app.post(
    '/opcoes/:id/disponibilidade',
    {
      config: ACESSO,
      preHandler: aoLigarDesligar(app),
      schema: { params: ParamId, body: DisponibilidadeEntrada, response: { 200: DisponibilidadeSaida } },
    },
    async (req) => alterarDisponibilidadeOpcao(app.pool, lojaDoEscopo(req), req.params.id, req.body),
  )

  await app.register(rotasGrupos)
  await app.register(rotasCatalogo)
}
