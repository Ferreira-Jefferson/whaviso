import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { criarServicoPainel, type OpcoesPainel } from './service'
import { PainelResumo, PainelSerie, PainelSerieQuery } from './schemas'

export function criarPlataformaPainelRoutes(opcoes: OpcoesPainel = {}): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoPainel(app.pool, opcoes)
    // Toda rota e 'plataforma' (escopo de operador); membro de loja recebe 403 do escopoOperador.
    // Nenhum parametro de loja/conta: o painel e agregado da base inteira.
    const plataforma = () => ({
      config: { acesso: 'plataforma' as const },
      preHandler: [app.autenticar, app.escopoOperador, app.exigirPermissao('painel:ver')],
    })

    app.get('/resumo', {
      ...plataforma(),
      schema: { response: { 200: PainelResumo } },
    }, async () => svc.resumo())

    app.get('/serie', {
      ...plataforma(),
      schema: { querystring: PainelSerieQuery, response: { 200: PainelSerie } },
    }, async (req) => svc.serie(req.query.meses))
  }
}

/** Plugin do registry: sem dependencia de segredo (so agregados, sem PII). */
export const plataformaPainelRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarPlataformaPainelRoutes()(instancia, opts)
