// Rotas do modulo configuracoes_llm (/v1/llm/*). A loja efetiva vem SO do escopo resolvido pelo
// kernel (header x-loja-id); nunca do corpo/query (SEC-002). Papeis:
//   - LEITURA (estado, uso): permissao `loja:gerir` (dono e gerente). O atendente nao ve a area.
//   - ESCRITA (set/rotate, patch, testar): SO o papel `dono` (ativo mais caro; decisao do spec).
// Rate limit curto nas rotas de escrita/teste de chave (SEC-101).
//
// Log: so ids/estado (provedor, ultimos4, acao); a chave NUNCA entra em log (SEC-024). O
// `req.body` carrega a chave em claro, entao nenhum handler loga o corpo.
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { proibido } from '../../shared/http_errors'
import {
  CredencialLlmEntrada,
  CredencialLlmEstado,
  CredencialLlmPatch,
  CredencialLlmTestarEntrada,
  CredencialLlmTesteSaida,
  LojaIdParam,
  PoolIdParam,
  PoolLlmAtribuicao,
  PoolLlmCriar,
  PoolLlmItem,
  PoolLlmLista,
  PoolLlmPatch,
  UsoLlmResumo,
} from './schemas'
import type { DepsConfigLlm } from './service'
import * as service from './service'
import { depsDeProducao } from './config'

const ACESSO_LOJA = 'conteudo_de_loja' as const
const LIMITE_SENSIVEL = { max: 5, timeWindow: '1 minute' }

/** Loja ativa garantida: `escopoLoja` + a guarda ja rodaram no preHandler. */
function lojaAtiva(req: FastifyRequest): string {
  const loja = req.escopo?.loja_ativa
  if (!loja) throw proibido('Loja ativa nao definida')
  return loja
}

/** Monta as rotas com um resolvedor PREGUICOSO das dependencias (cifra + validadores). */
function registrar(app: FastifyInstance, obterDeps: () => DepsConfigLlm): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // Leitura: `ia:ver` (dono e gerente). Atendente nao alcanca a area.
  const leitura = { config: { acesso: ACESSO_LOJA }, preHandler: guardaLeitura(app) }
  // Escrita: SO o dono; rate limit (SEC-101).
  const escrita = {
    config: { acesso: ACESSO_LOJA, rateLimit: LIMITE_SENSIVEL },
    preHandler: guardaEscrita(app),
  }

  // GET /llm/credencial: estado (sem chave). Sem credencial => configurada=false.
  r.get(
    '/credencial',
    { ...leitura, schema: { response: { 200: CredencialLlmEstado } } },
    async (req) => service.obterEstado(app.pool, lojaAtiva(req)),
  )

  // PUT /llm/credencial: set e rotate. Valida no provedor e so grava se valida.
  r.put(
    '/credencial',
    { ...escrita, schema: { body: CredencialLlmEntrada, response: { 200: CredencialLlmEstado } } },
    async (req) => {
      const b = req.body
      const estado = await service.definir(app.pool, obterDeps(), {
        lojaId: lojaAtiva(req),
        provedor: b.provedor,
        chave: b.chave,
        modeloPreferido: b.modelo_preferido,
      })
      // Log so com metadado; nunca a chave (SEC-024).
      req.log.info(
        { loja_id: lojaAtiva(req), provedor: estado.provedor, ultimos4: estado.ultimos4, acao: 'definir' },
        'credencial llm definida',
      )
      return estado
    },
  )

  // PATCH /llm/credencial: ativar/desativar e/ou trocar modelo (sem reenviar a chave).
  r.patch(
    '/credencial',
    { ...escrita, schema: { body: CredencialLlmPatch, response: { 200: CredencialLlmEstado } } },
    async (req) => {
      const estado = await service.ajustar(app.pool, lojaAtiva(req), req.body)
      req.log.info({ loja_id: lojaAtiva(req), ativo: estado.ativo, acao: 'ajustar' }, 'credencial llm ajustada')
      return estado
    },
  )

  // POST /llm/credencial/testar: revalida uma chave do corpo (nunca a gravada).
  r.post(
    '/credencial/testar',
    { ...escrita, schema: { body: CredencialLlmTestarEntrada, response: { 200: CredencialLlmTesteSaida } } },
    async (req) => {
      const b = req.body
      const resultado = await service.testar(obterDeps(), b.provedor, b.chave)
      req.log.info({ loja_id: lojaAtiva(req), provedor: b.provedor, resultado, acao: 'testar' }, 'credencial llm testada')
      return { resultado }
    },
  )

  // GET /llm/uso: resumo de consumo (painel de gasto).
  r.get(
    '/uso',
    { ...leitura, schema: { response: { 200: UsoLlmResumo } } },
    async (req) => service.obterUso(app.pool, lojaAtiva(req)),
  )

  // --- Pool de chaves de LLM da plataforma (admin: acesso 'plataforma', nao 'conteudo_de_loja') ---

  const plataforma = {
    config: { acesso: 'plataforma' as const, rateLimit: LIMITE_SENSIVEL },
    preHandler: [app.autenticar, app.escopoOperador, app.exigirPermissao('chaves_api:gerir')],
  }

  // GET /llm/pool: lista o pool inteiro (metadado; nunca a chave).
  r.get('/pool', { ...plataforma, schema: { response: { 200: PoolLlmLista } } },
    async () => service.listarPool(app.pool))

  // POST /llm/pool: cria uma chave nova do pool.
  r.post('/pool', { ...plataforma, schema: { body: PoolLlmCriar, response: { 201: PoolLlmItem } } },
    async (req, reply) => {
      const item = await service.criarPool(app.pool, obterDeps(), req.body)
      req.log.info({ id: item.id, nome: item.nome, provedor: item.provedor, acao: 'pool_criar' }, 'chave do pool de llm criada')
      void reply.code(201)
      return item
    })

  // PATCH /llm/pool/:id: renomear, ativar/desativar e/ou rotacionar a chave.
  r.patch('/pool/:id',
    { ...plataforma, schema: { params: PoolIdParam, body: PoolLlmPatch, response: { 200: PoolLlmItem } } },
    async (req) => {
      const item = await service.ajustarPool(app.pool, obterDeps(), req.params.id, req.body)
      req.log.info({ id: item.id, ativo: item.ativo, acao: 'pool_ajustar' }, 'chave do pool de llm ajustada')
      return item
    })

  // PUT /llm/pool/atribuicoes/:lojaId: operador atribui a chave do pool a uma loja (em vez da BYO).
  r.put('/pool/atribuicoes/:lojaId',
    { ...plataforma, schema: { params: LojaIdParam, body: PoolLlmAtribuicao, response: { 200: CredencialLlmEstado } } },
    async (req) => {
      const estado = await service.atribuirPool(app.pool, req.params.lojaId, req.body.pool_chave_id)
      req.log.info({ loja_id: req.params.lojaId, pool_chave_id: req.body.pool_chave_id, acao: 'pool_atribuir' }, 'chave do pool atribuida a loja')
      return estado
    })
}

/** Leitura: membro autenticado, escopo resolvido e permissao `ia:ver` (padrao: dono e gerente). */
function guardaLeitura(app: FastifyInstance) {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('ia:ver')]
}

/** Escrita: idem, mas `ia:configurar` (padrao: so o `dono`, papel fixo) (ativo mais caro; so o dono mexe na chave). */
function guardaEscrita(app: FastifyInstance) {
  return [app.autenticar, app.escopoLoja, app.exigirPermissao('ia:configurar')]
}

/** Plugin de PRODUCAO: resolve deps preguicosamente (LLM_MASTER_KEY + validadores HTTP). */
export const configuracoesLlmRoutes: FastifyPluginAsync = async (app) => {
  let cache: DepsConfigLlm | null = null
  registrar(app, () => (cache ??= depsDeProducao()))
}

/** Fabrica para TESTE: injeta `cifra` (chave de teste) e `validadores` (stubs, sem rede). */
export function criarRotasConfigLlm(deps: DepsConfigLlm): FastifyPluginAsync {
  return async (app) => {
    registrar(app, () => deps)
  }
}
