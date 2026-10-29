import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { regraNegocio } from '../../shared/http_errors'
import { avaliacaoDto, docDto, feedbackDto } from './mapeador'
import {
  AvaliacaoAtualizar, AvaliacaoCriar, AvaliacaoFiltro, AvaliacaoGoldenSaida, AvaliacoesGoldenSaida,
  DocumentoAtualizar, DocumentoCriar, DocumentoSaida, DocumentoVersoesSaida, DocumentosFiltro,
  DocumentosSaida, FeedbackFiltro, FeedbackPromovidoSaida, FeedbackPromover, FeedbackSaida,
  FeedbacksSaida, ParamId,
} from './schemas'
import { criarServico, type Ator } from './service'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw regraNegocio('loja_ativa_obrigatoria', 'Informe a loja ativa no header x-loja-id')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

export const conhecimentoRoutes: FastifyPluginAsync = async (instancia) => {
  const app = instancia.withTypeProvider<ZodTypeProvider>()
  const svc = criarServico(app.pool)
  const cfg = { config: { acesso: 'conteudo_de_loja' as const } }
  // Curadoria e gestao: dono e gerente (`conhecimento:ver`/`conhecimento:gerir`). O atendente (cargo) nunca chega aqui.
  const ver = [app.autenticar, app.escopoLoja, app.exigirPermissao('conhecimento:ver')]
  const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('conhecimento:gerir')]

  // ------------------------------------------------------------ documentos
  app.get('/documentos', {
    ...cfg, preHandler: ver,
    schema: { querystring: DocumentosFiltro, response: { 200: DocumentosSaida } },
  }, async (req) => {
    const r = await svc.listarDocumentos(ator(req), req.query)
    return { itens: r.itens.map(docDto) }
  })

  app.post('/documentos', {
    ...cfg, preHandler: gerir,
    schema: { body: DocumentoCriar, response: { 201: DocumentoSaida } },
  }, async (req, reply) => {
    const d = await svc.criarDocumento(ator(req), req.body)
    reply.code(201)
    return docDto(d)
  })

  app.get('/documentos/:id', {
    ...cfg, preHandler: ver,
    schema: { params: ParamId, response: { 200: DocumentoSaida } },
  }, async (req) => docDto(await svc.obterDocumento(ator(req), req.params.id)))

  app.get('/documentos/:id/versoes', {
    ...cfg, preHandler: ver,
    schema: { params: ParamId, response: { 200: DocumentoVersoesSaida } },
  }, async (req) => ({ versoes: (await svc.versoes(ator(req), req.params.id)).versoes.map(docDto) }))

  app.patch('/documentos/:id', {
    ...cfg, preHandler: gerir,
    schema: { params: ParamId, body: DocumentoAtualizar, response: { 200: DocumentoSaida } },
  }, async (req) => docDto(await svc.atualizarDocumento(ator(req), req.params.id, req.body)))

  app.post('/documentos/:id/aprovar', {
    ...cfg, preHandler: gerir,
    schema: { params: ParamId, response: { 200: DocumentoSaida } },
  }, async (req) => docDto(await svc.aprovar(ator(req), req.params.id)))

  app.post('/documentos/:id/arquivar', {
    ...cfg, preHandler: gerir,
    schema: { params: ParamId, response: { 200: DocumentoSaida } },
  }, async (req) => docDto(await svc.arquivar(ator(req), req.params.id)))

  // ------------------------------------------------------------ golden set
  app.get('/avaliacao', {
    ...cfg, preHandler: ver,
    schema: { querystring: AvaliacaoFiltro, response: { 200: AvaliacoesGoldenSaida } },
  }, async (req) => ({ itens: (await svc.listarAvaliacoes(ator(req), req.query)).itens.map(avaliacaoDto) }))

  app.post('/avaliacao', {
    ...cfg, preHandler: gerir,
    schema: { body: AvaliacaoCriar, response: { 201: AvaliacaoGoldenSaida } },
  }, async (req, reply) => {
    const a = await svc.criarAvaliacao(ator(req), req.body)
    reply.code(201)
    return avaliacaoDto(a)
  })

  app.patch('/avaliacao/:id', {
    ...cfg, preHandler: gerir,
    schema: { params: ParamId, body: AvaliacaoAtualizar, response: { 200: AvaliacaoGoldenSaida } },
  }, async (req) => avaliacaoDto(await svc.atualizarAvaliacao(ator(req), req.params.id, req.body)))

  // ------------------------------------------------------------ feedback (novo -> triado -> promovido)
  app.get('/feedback', {
    ...cfg, preHandler: ver,
    schema: { querystring: FeedbackFiltro, response: { 200: FeedbacksSaida } },
  }, async (req) => ({ itens: (await svc.listarFeedback(ator(req), req.query)).itens.map(feedbackDto) }))

  app.post('/feedback/:id/triar', {
    ...cfg, preHandler: gerir,
    schema: { params: ParamId, response: { 200: FeedbackSaida } },
  }, async (req) => feedbackDto(await svc.triar(ator(req), req.params.id)))

  app.post('/feedback/:id/descartar', {
    ...cfg, preHandler: gerir,
    schema: { params: ParamId, response: { 200: FeedbackSaida } },
  }, async (req) => feedbackDto(await svc.descartar(ator(req), req.params.id)))

  app.post('/feedback/:id/promover', {
    ...cfg, preHandler: gerir,
    schema: { params: ParamId, body: FeedbackPromover, response: { 200: FeedbackPromovidoSaida } },
  }, async (req) => {
    const r = await svc.promover(ator(req), req.params.id, req.body)
    return { feedback: feedbackDto(r.feedback), documento: docDto(r.documento) }
  })
}
