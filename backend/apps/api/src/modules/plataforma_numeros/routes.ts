// Rotas do CONSOLE (`/v1/plataforma-numeros`): o OPERADOR da plataforma gere os numeros de
// QUALQUER loja. Camada FINA sobre o kernel compartilhado `shared/numeros` (dono da tabela, da
// regra e do segredo); este modulo nao acessa o banco direto nem importa outro modulo.
//
// Escopo (SEC-003): toda rota e `acesso: 'plataforma'` + `escopoOperador`; um membro de loja cai
// no bloqueio-por-padrao do escopo de operador (403). A loja alvo vem SEMPRE de params validados
// por Zod (`:lojaId`) ou e resolvida a partir do numero (`:id`); NUNCA do corpo/query. O operador
// e global por desenho: nao ha isolamento por tenant aqui, mas ha a grade de permissao de console
// (`numeros_plataforma:ver` / `:gerir`).
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
  depsDeProducao,
  servicoNumeros as service,
  type DepsNumeros,
} from '../../shared/numeros'
import {
  listaNumerosSaida,
  lojaIdParam,
  numeroConectarEntrada,
  numeroIdParam,
  numeroReconectarEntrada,
  numeroSaida,
  numeroStatusEntrada,
} from './schemas'

const ACESSO = 'plataforma' as const
const LIMITE_SENSIVEL = { max: 5, timeWindow: '1 minute' }

/** Monta as rotas com um resolvedor PREGUICOSO de dependencias (cifra + porta Meta). */
function registrar(app: FastifyInstance, obterDeps: () => DepsNumeros): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const ver = [app.autenticar, app.escopoOperador, app.exigirPermissao('numeros_plataforma:ver')]
  const gerir = [app.autenticar, app.escopoOperador, app.exigirPermissao('numeros_plataforma:gerir')]
  const base = { config: { acesso: ACESSO } }
  const sensivel = { config: { acesso: ACESSO, rateLimit: LIMITE_SENSIVEL } }

  // GET /lojas/:lojaId/numeros: lista os numeros de uma loja alvo.
  r.get(
    '/lojas/:lojaId/numeros',
    { ...base, preHandler: ver, schema: { params: lojaIdParam, response: { 200: listaNumerosSaida } } },
    async (req) => {
      await service.garantirLoja(app.pool, req.params.lojaId)
      return { numeros: await service.listar(app.pool, req.params.lojaId) }
    },
  )

  // POST /lojas/:lojaId/numeros: conecta um numero numa loja alvo (Embedded Signup). Rate limit.
  r.post(
    '/lojas/:lojaId/numeros',
    {
      ...sensivel,
      preHandler: gerir,
      schema: { params: lojaIdParam, body: numeroConectarEntrada, response: { 201: numeroSaida } },
    },
    async (req, reply) => {
      await service.garantirLoja(app.pool, req.params.lojaId)
      const b = req.body
      const saida = await service.conectar(app.pool, obterDeps(), {
        lojaId: req.params.lojaId,
        codigo: b.codigo,
        wabaId: b.waba_id,
        phoneNumberId: b.phone_number_id,
      })
      // Log so com ids/estado; nunca o token nem o numero (SEC-024).
      req.log.info(
        { numero_id: saida.id, loja_id: saida.loja_id, acao: 'conectado', via: 'console' },
        'numero conectado (console)',
      )
      void reply.code(201)
      return saida
    },
  )

  // GET /numeros/:id: detalhe de um numero (a loja e resolvida a partir do id). 404 se nao existe.
  r.get(
    '/numeros/:id',
    { ...base, preHandler: ver, schema: { params: numeroIdParam, response: { 200: numeroSaida } } },
    async (req) => {
      const lojaId = await service.resolverLoja(app.pool, req.params.id)
      return service.detalhar(app.pool, lojaId, req.params.id)
    },
  )

  // PATCH /numeros/:id/status: pausar, reativar, remover (sem DELETE).
  r.patch(
    '/numeros/:id/status',
    {
      ...base,
      preHandler: gerir,
      schema: { params: numeroIdParam, body: numeroStatusEntrada, response: { 200: numeroSaida } },
    },
    async (req) => {
      const lojaId = await service.resolverLoja(app.pool, req.params.id)
      const saida = await service.mudarStatus(app.pool, lojaId, req.params.id, req.body.acao)
      req.log.info(
        { numero_id: saida.id, loja_id: saida.loja_id, acao: req.body.acao, via: 'console' },
        'numero status (console)',
      )
      return saida
    },
  )

  // POST /numeros/:id/reconectar: rotaciona o token. Rate limit.
  r.post(
    '/numeros/:id/reconectar',
    {
      ...sensivel,
      preHandler: gerir,
      schema: { params: numeroIdParam, body: numeroReconectarEntrada, response: { 200: numeroSaida } },
    },
    async (req) => {
      const lojaId = await service.resolverLoja(app.pool, req.params.id)
      const saida = await service.reconectar(app.pool, obterDeps(), lojaId, req.params.id, req.body.codigo)
      req.log.info(
        { numero_id: saida.id, loja_id: saida.loja_id, acao: 'reconectado', via: 'console' },
        'numero reconectado (console)',
      )
      return saida
    },
  )
}

/** Plugin de PRODUCAO: resolve deps preguicosamente de `app.env` (MASTER_KEY + Meta). */
export const plataformaNumerosRoutes: FastifyPluginAsync = async (app) => {
  let cache: DepsNumeros | null = null
  registrar(app, () => (cache ??= depsDeProducao(app.env)))
}

/** Fabrica para TESTE: injeta `onboarding` (stub) e `cripto` com chave de teste. */
export function criarRotasPlataformaNumeros(deps: DepsNumeros): FastifyPluginAsync {
  return async (app) => {
    registrar(app, () => deps)
  }
}
