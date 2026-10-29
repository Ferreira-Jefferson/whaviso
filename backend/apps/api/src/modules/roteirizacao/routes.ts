import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { criarMapasOsmDoAmbiente, type ClienteMapas } from '@whaviso/shared/clientes'
import { HttpError } from '../../shared/http_errors'
import { criarMapasIndisponivel } from './mapas_indisponivel'
import {
  DespachoConfigEntrada, DespachoConfigSaida, GeocodificarEnderecoEntrada, GeocodificarEnderecoSaida,
  GeocodificarPendentesEntrada, GeocodificarPendentesSaida,
  RoteirizacaoAceitarEntrada, RoteirizacaoAceitarSaida, RoteirizacaoReordenarEntrada,
  RoteirizacaoReordenarSaida, RoteirizacaoSugerirEntrada, RoteirizacaoSugerirSaida,
} from './schemas'
import { criarServicoRoteirizacao, type Ator, type OpcoesServico } from './service'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

/**
 * Fabrica do plugin com o ClienteMapas injetado (a api real injeta o provedor; testes injetam o fake).
 * Todo acesso a mapas passa por essa interface: o modulo nunca faz HTTP direto (SEC-070).
 */
export function criarRoteirizacaoRoutes(mapas: ClienteMapas, op: OpcoesServico = {}): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoRoteirizacao(app.pool, mapas, op)
    const fator = op.rateLimitFator ?? 1
    const limite = (max: number) => ({ rateLimit: { max: max * fator, timeWindow: '1 minute' } })
    const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
    // Sugerir/aceitar e rotina do despacho (dono, gerente, atendente); a config da loja e de quem gere a loja.
    const ver = [app.autenticar, app.escopoLoja, app.exigirPermissao('roteirizacao:ver')]
    const operar = [app.autenticar, app.escopoLoja, app.exigirPermissao('roteirizacao:operar')]
    const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('roteirizacao:gerir')]

    app.get('/config', {
      ...loja(), preHandler: ver, schema: { response: { 200: DespachoConfigSaida } },
    }, async (req) => svc.obterConfig(ator(req)))

    app.put('/config', {
      ...loja(limite(30)), preHandler: gerir,
      schema: { body: DespachoConfigEntrada, response: { 200: DespachoConfigSaida } },
    }, async (req) => svc.atualizarConfig(ator(req), req.body))

    // SEC-101: geocode e sugestao custam chamada ao provedor (limite publico ~1 req/s): rate limit curto.
    app.post('/geocodificar-pendentes', {
      ...loja(limite(6)), preHandler: operar,
      schema: { body: GeocodificarPendentesEntrada, response: { 200: GeocodificarPendentesSaida } },
    }, async (req) => svc.geocodificarPendentes(ator(req), req.body))

    // Seletor de mapa do painel (planta o icone da loja): geocodifica um endereco avulso, nao persiste.
    // Custa uma chamada ao provedor (limite publico ~1 req/s): rate limit curto. Guard `roteirizacao:gerir`
    // (padrao gerente): o seletor de mapa e ferramenta de configuracao do despacho.
    app.post('/geocodificar-endereco', {
      ...loja(limite(20)), preHandler: gerir,
      schema: { body: GeocodificarEnderecoEntrada, response: { 200: GeocodificarEnderecoSaida } },
    }, async (req) => svc.geocodificarEndereco(ator(req), req.body))

    app.post('/sugerir', {
      ...loja(limite(12)), preHandler: operar,
      schema: { body: RoteirizacaoSugerirEntrada, response: { 200: RoteirizacaoSugerirSaida } },
    }, async (req) => svc.sugerir(ator(req), req.body))

    app.post('/aceitar', {
      ...loja(limite(60)), preHandler: operar,
      schema: { body: RoteirizacaoAceitarEntrada, response: { 201: RoteirizacaoAceitarSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.aceitar(ator(req), req.body)))

    app.post('/reordenar', {
      ...loja(limite(30)), preHandler: operar,
      schema: { body: RoteirizacaoReordenarEntrada, response: { 200: RoteirizacaoReordenarSaida } },
    }, async (req) => svc.reordenar(ator(req), req.body))
  }
}

/**
 * Plugin padrao do registry: injeta o ClienteMapas real (Nominatim + OSRM) quando as vars
 * API_MAPAS_* estao configuradas; sem elas (dev/offline/testes), cai em `mapas_indisponivel`,
 * que degrada para linha reta (haversine) e deixa o geocode pendente, sem inventar coordenada.
 */
export const roteirizacaoRoutes: FastifyPluginAsync = criarRoteirizacaoRoutes(
  criarMapasOsmDoAmbiente() ?? criarMapasIndisponivel(),
)
