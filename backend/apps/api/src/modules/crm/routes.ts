import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoCrm, type Ator } from './service'
import {
  CrmClienteDetalheSaida, CrmClientesEntrada, CrmClientesSaida, CrmConsentimento, CrmConsentimentoEntrada,
  CrmItensEntrada, CrmItensSaida, CrmResumoSaida, IdParams,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const crmRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoCrm(app.pool)
  const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
  // Metricas (RFM, mais vendidos) sao relatorio: dono/gerente. Registrar opt-out e atendimento:
  // quem opera o turno (inclui atendente) precisa conseguir honrar "pare de me mandar mensagem".
  const ler = [app.autenticar, app.escopoLoja, app.exigirPermissao('relatorios:ver')]
  const operar = [app.autenticar, app.escopoLoja, app.exigirPermissao('pedidos:gerir')]

  app.get('/clientes', {
    ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: ler,
    schema: { querystring: CrmClientesEntrada, response: { 200: CrmClientesSaida } },
  }, async (req) => svc.listar(ator(req), req.query))

  app.get('/resumo', {
    ...loja(), preHandler: ler,
    schema: { response: { 200: CrmResumoSaida } },
  }, async (req) => svc.resumo(ator(req)))

  app.get('/itens', {
    ...loja(), preHandler: ler,
    schema: { querystring: CrmItensEntrada, response: { 200: CrmItensSaida } },
  }, async (req) => svc.itens(ator(req), req.query))

  app.get('/clientes/:id', {
    ...loja(), preHandler: ler,
    schema: { params: IdParams, response: { 200: CrmClienteDetalheSaida } },
  }, async (req) => svc.detalhe(ator(req), req.params.id))

  app.put('/clientes/:id/consentimento', {
    ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: operar,
    schema: { params: IdParams, body: CrmConsentimentoEntrada, response: { 200: CrmConsentimento } },
  }, async (req) => svc.definirConsentimento(ator(req), req.params.id, req.body))
}
