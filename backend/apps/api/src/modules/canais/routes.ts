// Rotas do modulo canais (/v1/canais/*). A loja efetiva vem SO do escopo (x-loja-id); nunca do
// corpo/query (SEC-002). Leitura e gestao: `loja:gerir` (dono e gerente). Conectar/trocar
// credencial: SO o dono (segredo). Rate limit curto nas rotas sensiveis/custosas (SEC-101).
// Log: so ids/estado; o corpo carrega a credencial em claro, entao nenhum handler loga `req.body`.
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { proibido } from '../../shared/http_errors'
import { depsDeProducao, type DepsCanais } from './config'
import * as service from './service'
import {
  CanalConectarEntrada, CanalEstado, CanalParams, CanalPatch, CanalPedidosSaida, CanaisSaida,
  CanalSincronizarSaida,
} from './schemas'

const ACESSO = 'conteudo_de_loja' as const

function lojaAtiva(req: FastifyRequest): string {
  const loja = req.escopo?.loja_ativa
  if (!loja) throw proibido('Loja ativa nao definida')
  return loja
}

function registrar(app: FastifyInstance, obterDeps: () => DepsCanais): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('loja:gerir')]
  const dono = [app.autenticar, app.escopoLoja, app.exigirPapel('dono')]
  const leitura = { config: { acesso: ACESSO }, preHandler: gerir }

  r.get('/', { ...leitura, schema: { response: { 200: CanaisSaida } } }, async (req) =>
    service.listar(app.pool, lojaAtiva(req)))

  r.get('/pedidos', { ...leitura, schema: { response: { 200: CanalPedidosSaida } } }, async (req) =>
    service.pedidosImportados(app.pool, lojaAtiva(req)))

  r.put('/', {
    config: { acesso: ACESSO, rateLimit: { max: 10, timeWindow: '1 minute' } }, preHandler: dono,
    schema: { body: CanalConectarEntrada, response: { 200: CanalEstado } },
  }, async (req) => {
    const estado = await service.conectar(app.pool, obterDeps(), lojaAtiva(req), req.body)
    req.log.info({ loja_id: lojaAtiva(req), canal: estado.canal, acao: 'conectar' }, 'canal conectado')
    return estado
  })

  r.patch('/:canal', {
    config: { acesso: ACESSO, rateLimit: { max: 20, timeWindow: '1 minute' } }, preHandler: gerir,
    schema: { params: CanalParams, body: CanalPatch, response: { 200: CanalEstado } },
  }, async (req) => service.ajustar(app.pool, lojaAtiva(req), req.params.canal, req.body))

  r.post('/:canal/sincronizar', {
    config: { acesso: ACESSO, rateLimit: { max: 12, timeWindow: '1 minute' } }, preHandler: gerir,
    schema: { params: CanalParams, response: { 200: CanalSincronizarSaida } },
  }, async (req) => {
    const saida = await service.sincronizar(app.pool, obterDeps(), lojaAtiva(req), req.params.canal)
    req.log.info({ loja_id: lojaAtiva(req), canal: req.params.canal, ...saida, acao: 'sincronizar' }, 'canal sincronizado')
    return saida
  })
}

/** Plugin de PRODUCAO: deps resolvidas preguicosamente (CANAIS_MASTER_KEY + clientes stub). */
export const canaisRoutes: FastifyPluginAsync = async (app) => {
  let cache: DepsCanais | null = null
  registrar(app, () => (cache ??= depsDeProducao()))
}

/** Fabrica para TESTE: injeta cifra e clientes (fake, sem rede). */
export function criarRotasCanais(deps: DepsCanais): FastifyPluginAsync {
  return async (app) => registrar(app, () => deps)
}
