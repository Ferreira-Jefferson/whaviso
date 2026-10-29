import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { naoAutorizado } from '../../shared/http_errors'
import { configurarFonteGrade, recarregarGrade } from '../../shared/tenant'
import { criarServicoAcessos } from './service'
import { AcessosSaida, CelulaDTO, CelulaPatch } from './schemas'

export function criarAcessosRoutes(): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    // A grade viva vem do banco: liga a fonte do cache e carrega no boot. Se a leitura falhar
    // (ex.: migration ainda nao aplicada), o cache segue nos padroes do catalogo.
    configurarFonteGrade(app.pool)
    await recarregarGrade().catch(() => undefined)

    const svc = criarServicoAcessos(app.pool)
    // Rota de plataforma; so quem tem `acessos:gerir` (admin: fixo e nao delegavel).
    const preHandler = [app.autenticar, app.escopoOperador, app.exigirPermissao('acessos:gerir')]

    app.get('/', {
      config: { acesso: 'plataforma' as const }, preHandler,
      schema: { response: { 200: AcessosSaida } },
    }, async () => svc.listar())

    app.patch('/grade', {
      config: { acesso: 'plataforma' as const, rateLimit: { max: 120, timeWindow: '1 minute' } }, preHandler,
      schema: { body: CelulaPatch, response: { 200: CelulaDTO } },
    }, async (req) => {
      const o = req.operador
      if (!o) throw naoAutorizado()
      return svc.alterar({ userId: o.user_id }, req.body)
    })
  }
}

export const acessosRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarAcessosRoutes()(instancia, opts)
