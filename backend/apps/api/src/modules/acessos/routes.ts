import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { naoAutorizado } from '../../shared/http_errors'
import { configurarFonteGrade, iniciarEscutaGrade, recarregarGrade } from '../../shared/tenant'
import { criarServicoAcessos } from './service'
import { AcessosSaida, CelulaDTO, CelulaPatch, MinhasPermissoesSaida } from './schemas'

export interface OpcoesAcessos {
  /**
   * Connection string DIRETA/session para o LISTEN da grade (item 14, C2). Ausente = sem LISTEN
   * (so o cache por TTL + invalidacao local ao salvar). A producao passa DATABASE_URL_LISTEN.
   */
  urlEscuta?: string
}

export function criarAcessosRoutes(opcoes: OpcoesAcessos = {}): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    // A grade viva vem do banco: liga a fonte do cache e carrega no boot. Se a leitura falhar
    // (ex.: migration ainda nao aplicada), o cache segue nos padroes do catalogo.
    configurarFonteGrade(app.pool)
    await recarregarGrade().catch(() => undefined)
    // Cada processo escuta o canal da grade: um save em QUALQUER instancia invalida o cache aqui
    // na hora. Reconecta sozinho; ao voltar, recarrega (um aviso pode ter se perdido).
    if (opcoes.urlEscuta) {
      const escuta = iniciarEscutaGrade({
        connectionString: opcoes.urlEscuta,
        aoFalha: (motivo) => app.log.warn({ motivo }, 'acessos: conexao LISTEN da grade caiu'),
      })
      app.addHook('onClose', async () => escuta.parar())
    }

    const svc = criarServicoAcessos(app.pool)
    // Rota de plataforma; so quem tem `acessos:gerir` (admin: fixo e nao delegavel).
    const preHandler = [app.autenticar, app.escopoOperador, app.exigirPermissao('acessos:gerir')]

    // Permissoes do proprio usuario nas suas lojas: qualquer membro (sem `exigirPermissao`; so descreve o
    // que ele mesmo pode). Serve a UI para nao oferecer o que o servidor negaria.
    app.get('/minhas', {
      config: { acesso: 'conteudo_de_loja' as const },
      preHandler: [app.autenticar, app.escopoLoja],
      schema: { response: { 200: MinhasPermissoesSaida } },
    }, async (req) => {
      if (!req.escopo) throw naoAutorizado()
      return svc.minhasPermissoes(req.escopo)
    })

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
  criarAcessosRoutes({ urlEscuta: instancia.env.DATABASE_URL_LISTEN ?? instancia.env.DATABASE_URL })(instancia, opts)
