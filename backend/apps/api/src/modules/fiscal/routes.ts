// Rotas do modulo fiscal (/v1/fiscal/*). A loja efetiva vem SO do escopo (x-loja-id).
//   - Leitura e emissao: permissao `loja:gerir` (dono e gerente).
//   - Config (credencial do emissor): SO o papel `dono`.
// Log: so ids/estado; a credencial NUNCA entra em log (o corpo do PUT /config a carrega, entao
// nenhum handler loga o corpo).
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { proibido } from '../../shared/http_errors'
import {
  AutoEmissaoSaida,
  DocumentoFiscalEmitirEntrada,
  DocumentoFiscalIdParams,
  DocumentoFiscalSaida,
  DocumentosFiscaisEntrada,
  DocumentosFiscaisSaida,
  FiscalConfigEntrada,
  FiscalConfigEstado,
  FiscalConfigPatch,
  ItemFiscalDadoEntrada,
  ItemFiscalIdParams,
  ItemFiscalLinha,
  ItensFiscaisSaida,
  PedidosEmissiveisSaida,
} from './schemas'
import * as service from './service'
import type { DepsFiscal } from './service'
import { depsDeProducao } from './config'

const ACESSO_LOJA = 'conteudo_de_loja' as const
const LIMITE_SENSIVEL = { max: 5, timeWindow: '1 minute' }
const LIMITE_EMISSAO = { max: 30, timeWindow: '1 minute' }

function escopo(req: FastifyRequest): { lojaId: string; userId: string } {
  const e = req.escopo
  if (!e?.loja_ativa) throw proibido('Loja ativa nao definida')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

function registrar(app: FastifyInstance, obterDeps: () => DepsFiscal): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')]
  const dono = [app.autenticar, app.escopoLoja, app.exigirPapel('dono')]

  r.get('/config', { config: { acesso: ACESSO_LOJA }, preHandler: gerir, schema: { response: { 200: FiscalConfigEstado } } },
    async (req) => service.obterConfig(app.pool, escopo(req).lojaId))

  r.put('/config', {
    config: { acesso: ACESSO_LOJA, rateLimit: LIMITE_SENSIVEL }, preHandler: dono,
    schema: { body: FiscalConfigEntrada, response: { 200: FiscalConfigEstado } },
  }, async (req) => {
    const { lojaId } = escopo(req)
    const estado = await service.definirConfig(app.pool, obterDeps(), lojaId, req.body)
    req.log.info({ loja_id: lojaId, ambiente: estado.ambiente, acao: 'definir_config_fiscal' }, 'config fiscal definida')
    return estado
  })

  r.patch('/config', {
    config: { acesso: ACESSO_LOJA, rateLimit: LIMITE_SENSIVEL }, preHandler: dono,
    schema: { body: FiscalConfigPatch, response: { 200: FiscalConfigEstado } },
  }, async (req) => service.ajustarConfig(app.pool, escopo(req).lojaId, req.body))

  r.post('/documentos', {
    config: { acesso: ACESSO_LOJA, rateLimit: LIMITE_EMISSAO }, preHandler: gerir,
    schema: { body: DocumentoFiscalEmitirEntrada, response: { 201: DocumentoFiscalSaida } },
  }, async (req, reply) => {
    const { lojaId, userId } = escopo(req)
    const doc = await service.emitir(app.pool, obterDeps(), lojaId, userId, req.body)
    req.log.info({ loja_id: lojaId, documento_id: doc.id, status: doc.status, tipo: doc.tipo }, 'documento fiscal solicitado')
    return reply.status(201).send(doc)
  })

  r.post('/documentos/auto', {
    config: { acesso: ACESSO_LOJA, rateLimit: LIMITE_SENSIVEL }, preHandler: gerir,
    schema: { response: { 200: AutoEmissaoSaida } },
  }, async (req) => {
    const { lojaId, userId } = escopo(req)
    const resumo = await service.emitirAuto(app.pool, obterDeps(), lojaId, userId)
    req.log.info({ loja_id: lojaId, ...resumo, acao: 'emitir_auto' }, 'emissao fiscal automatica')
    return resumo
  })

  r.get('/pedidos-emissiveis', {
    config: { acesso: ACESSO_LOJA }, preHandler: gerir,
    schema: { response: { 200: PedidosEmissiveisSaida } },
  }, async (req) => service.pedidosEmissiveis(app.pool, escopo(req).lojaId, 50))

  r.get('/itens', {
    config: { acesso: ACESSO_LOJA }, preHandler: gerir,
    schema: { response: { 200: ItensFiscaisSaida } },
  }, async (req) => service.listarItensFiscais(app.pool, escopo(req).lojaId))

  r.put('/itens/:itemId', {
    config: { acesso: ACESSO_LOJA }, preHandler: gerir,
    schema: { params: ItemFiscalIdParams, body: ItemFiscalDadoEntrada, response: { 200: ItemFiscalLinha } },
  }, async (req) => service.definirItemFiscal(app.pool, escopo(req).lojaId, req.params.itemId, req.body))

  r.get('/documentos', {
    config: { acesso: ACESSO_LOJA }, preHandler: gerir,
    schema: { querystring: DocumentosFiscaisEntrada, response: { 200: DocumentosFiscaisSaida } },
  }, async (req) => service.listar(app.pool, escopo(req).lojaId, req.query))

  r.get('/documentos/:id', {
    config: { acesso: ACESSO_LOJA }, preHandler: gerir,
    schema: { params: DocumentoFiscalIdParams, response: { 200: DocumentoFiscalSaida } },
  }, async (req) => service.detalhe(app.pool, escopo(req).lojaId, req.params.id))
}

/** Plugin de PRODUCAO: deps resolvidas preguicosamente (FISCAL_MASTER_KEY + emissor). */
export const fiscalRoutes: FastifyPluginAsync = async (app) => {
  let cache: DepsFiscal | null = null
  registrar(app, () => (cache ??= depsDeProducao()))
}

/** Fabrica para TESTE: injeta cifra de teste e emissor fake. */
export function criarRotasFiscal(deps: DepsFiscal): FastifyPluginAsync {
  return async (app) => {
    registrar(app, () => deps)
  }
}
