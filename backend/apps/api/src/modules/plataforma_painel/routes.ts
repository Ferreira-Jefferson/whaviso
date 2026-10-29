import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { criarServicoPainel, type OpcoesPainel } from './service'
import { OperadorEu, PainelResumo, PainelSerie, PainelSerieQuery } from './schemas'

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

    // Identidade do operador: gate SO por `escopoOperador` (vinculo ativo em `operadores`), sem
    // `exigirPermissao`. Ser operador e fato, nao permissao editavel: desligar `painel:ver` na grade
    // nao expulsa ninguem do console (so esconde o CONTEUDO do painel). Usada pela sonda do front.
    app.get('/eu', {
      config: { acesso: 'plataforma' as const },
      preHandler: [app.autenticar, app.escopoOperador],
      schema: { response: { 200: OperadorEu } },
    }, async (req) => ({ operador: true as const, papel: req.operador?.papel ?? '' }))

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
