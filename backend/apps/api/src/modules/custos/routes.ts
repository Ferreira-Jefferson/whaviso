// Rotas do modulo custos (/v1/custos/*). Duas visoes sobre o mesmo razao:
//   - LOJA (`acesso: conteudo_de_loja`): /resumo e /eventos, so a loja do escopo (x-loja-id,
//     nunca do corpo/query; SEC-002). Permissao `loja:gerir` (dono e gerente veem custo).
//   - OPERADOR (`acesso: plataforma`): /plataforma/resumo e /plataforma/tarifas. Agregado da base
//     inteira, sem conteudo e sem lista por loja (SEC-003). Membro de loja recebe 403.
// Somente leitura: o razao e gravado pelos produtores (registrarEventoCusto), nunca por HTTP.
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoCustos } from './service'
import {
  CustosEventosEntrada, CustosEventosSaida, CustosPeriodoQuery, CustosResumoLojaSaida,
  CustosResumoPlataformaSaida, TarifasMetaEntrada, TarifasMetaSaida,
} from './schemas'

function lojaAtiva(req: FastifyRequest): string {
  const loja = req.escopo?.loja_ativa
  if (!loja) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return loja
}

export const custosRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoCustos(app.pool)
  const limite = { rateLimit: { max: 60, timeWindow: '1 minute' } }
  const loja = {
    config: { acesso: 'conteudo_de_loja' as const, ...limite },
    preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')],
  }
  const plataforma = {
    config: { acesso: 'plataforma' as const, ...limite },
    preHandler: [app.autenticar, app.escopoOperador],
  }

  app.get('/resumo', {
    ...loja, schema: { querystring: CustosPeriodoQuery, response: { 200: CustosResumoLojaSaida } },
  }, async (req) => svc.resumoLoja(lojaAtiva(req), req.query))

  app.get('/eventos', {
    ...loja, schema: { querystring: CustosEventosEntrada, response: { 200: CustosEventosSaida } },
  }, async (req) => svc.eventosLoja(lojaAtiva(req), req.query))

  app.get('/plataforma/resumo', {
    ...plataforma, schema: { querystring: CustosPeriodoQuery, response: { 200: CustosResumoPlataformaSaida } },
  }, async (req) => svc.resumoPlataforma(req.query))

  app.get('/plataforma/tarifas', {
    ...plataforma, schema: { querystring: TarifasMetaEntrada, response: { 200: TarifasMetaSaida } },
  }, async (req) => svc.tarifas(req.query))
}
