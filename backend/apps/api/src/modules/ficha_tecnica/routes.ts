// Rotas do modulo ficha_tecnica (/v1/ficha-tecnica). Loja efetiva SO do escopo (x-loja-id),
// nunca do corpo/query (SEC-002). Leitura: qualquer membro da loja. Edicao: dono/gerente
// (permissao loja:gerir), pois a ficha e estrutura do cardapio.
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { regraNegocio } from '../../shared/http_errors'
import { criarServicoFichaTecnica, type Ator } from './service'
import { FichaTecnicaEntrada, FichaTecnicaSaida, ItemIdParams } from './schemas'

function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) {
    throw regraNegocio('loja_ativa_obrigatoria', 'Informe a loja ativa no header x-loja-id')
  }
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const fichaTecnicaRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoFichaTecnica(app.pool)
  const acesso = { acesso: 'conteudo_de_loja' as const }
  const aoLer = [app.autenticar, app.escopoLoja]
  const aoEditar = [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')]

  app.get('/itens/:itemId', {
    config: acesso,
    preHandler: aoLer,
    schema: { params: ItemIdParams, response: { 200: FichaTecnicaSaida } },
  }, async (req) => svc.obter(ator(req), req.params.itemId))

  app.put('/itens/:itemId', {
    config: acesso,
    preHandler: aoEditar,
    schema: { params: ItemIdParams, body: FichaTecnicaEntrada, response: { 200: FichaTecnicaSaida } },
  }, async (req) => svc.definir(ator(req), req.params.itemId, req.body))
}
