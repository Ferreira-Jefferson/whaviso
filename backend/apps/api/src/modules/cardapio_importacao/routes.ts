import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { criarServicoImportacao, type Ator } from './service'
import {
  IdParams, ImportacaoCardapioAprovadaSaida, ImportacaoCardapioCriada, ImportacaoCardapioCriar,
  ImportacaoCardapioDescartadaSaida, ImportacaoCardapioEditar, ImportacaoCardapioEstado,
  ImportacoesCardapioSaida,
} from './schemas'

/** Corpo do upload: 10 MB em base64 (~13,4 MB) + folga do JSON. Demais rotas seguem o padrao da app. */
const LIMITE_UPLOAD_BYTES = 14 * 1024 * 1024

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query); SEC-110. */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const cardapioImportacaoRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServicoImportacao(app.pool)
  const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
  // Importar cardapio e gestao: dono e gerente (`loja:gerir`), nunca o atendente.
  const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')]

  // Upload: rate limit curto (SEC-101; cada job custa chamada de LLM) e bodyLimit proprio.
  app.post('/', {
    ...loja({ rateLimit: { max: 5, timeWindow: '1 minute' } }), preHandler: gerir,
    bodyLimit: LIMITE_UPLOAD_BYTES,
    schema: { body: ImportacaoCardapioCriar, response: { 202: ImportacaoCardapioCriada } },
  }, async (req, reply) => {
    const r = await svc.criar(ator(req), req.body.arquivo_base64)
    reply.code(202)
    return r
  })

  app.get('/', {
    ...loja(), preHandler: gerir,
    schema: { response: { 200: ImportacoesCardapioSaida } },
  }, async (req) => svc.listar(ator(req)))

  app.get('/:id', {
    ...loja(), preHandler: gerir,
    schema: { params: IdParams, response: { 200: ImportacaoCardapioEstado } },
  }, async (req) => svc.detalhe(ator(req), req.params.id))

  app.patch('/:id', {
    ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }), preHandler: gerir,
    schema: { params: IdParams, body: ImportacaoCardapioEditar, response: { 200: ImportacaoCardapioEstado } },
  }, async (req) => svc.editar(ator(req), req.params.id, req.body.rascunho))

  app.post('/:id/aprovar', {
    ...loja({ rateLimit: { max: 30, timeWindow: '1 minute' } }), preHandler: gerir,
    schema: { params: IdParams, response: { 200: ImportacaoCardapioAprovadaSaida } },
  }, async (req) => svc.aprovar(ator(req), req.params.id))

  app.post('/:id/descartar', {
    ...loja({ rateLimit: { max: 30, timeWindow: '1 minute' } }), preHandler: gerir,
    schema: { params: IdParams, response: { 200: ImportacaoCardapioDescartadaSaida } },
  }, async (req) => svc.descartar(ator(req), req.params.id))
}
