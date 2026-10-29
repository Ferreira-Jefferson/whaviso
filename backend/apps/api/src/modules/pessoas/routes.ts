import { z } from 'zod'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { cifraPadrao, type Cifra } from './cripto'
import { criarServicoPessoas, type Ator } from './service'
import { atualizarCargo, criarCargo, listarCargos } from './service_cargos'
import {
  CargoAtualizarEntrada, CargoCriarEntrada, CargoListaSaida, CargoSaida, EscalaAtualizarEntrada,
  EscalaCriarEntrada, EscalaListaSaida, EscalaSaida, PessoaAtualizarEntrada, PessoaCriarEntrada,
  PessoaDetalheSaida, PessoaEntregaEntrada, PessoaEntregaPixSaida, PessoaEntregaSaida, PessoaListaSaida,
  PessoaSaida, PessoaTelefoneSaida, IdParams,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

const ListaQuery = z.strictObject({ incluir_inativos: z.enum(['true', 'false']).optional() })

/** Fabrica do plugin; `cifra` injetavel (testes). Padrao: cifra da MASTER_KEY (lazy). */
export function criarPessoasRoutes(cifra?: Cifra): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoPessoas(app.pool, cifra ?? cifraPadrao())
    const loja = (extra: object = {}) => ({ config: { acesso: 'conteudo_de_loja' as const, ...extra } })
    // Grade editavel: ver x gerir equipe (padrao dono/gerente); revelar PII e permissao propria.
    const ver = [app.autenticar, app.escopoLoja, app.exigirPermissao('pessoas:ver')]
    const gerir = [app.autenticar, app.escopoLoja, app.exigirPermissao('pessoas:gerir')]

    // --- Cargos (funcoes) ---
    app.get('/cargos', {
      ...loja(), preHandler: ver,
      schema: { response: { 200: CargoListaSaida } },
    }, async (req) => listarCargos(app.pool, ator(req).lojaId))

    app.post('/cargos', {
      ...loja(), preHandler: gerir,
      schema: { body: CargoCriarEntrada, response: { 201: CargoSaida } },
    }, async (req, reply) => reply.status(201).send(await criarCargo(app.pool, ator(req).lojaId, req.body.nome)))

    app.patch('/cargos/:id', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, body: CargoAtualizarEntrada, response: { 200: CargoSaida } },
    }, async (req) => atualizarCargo(app.pool, ator(req).lojaId, req.params.id, req.body))

    // --- Pessoas ---
    app.get('/', {
      ...loja(), preHandler: ver,
      schema: { querystring: ListaQuery, response: { 200: PessoaListaSaida } },
    }, async (req) => svc.listar(ator(req), req.query.incluir_inativos === 'true'))

    app.post('/', {
      ...loja(), preHandler: gerir,
      schema: { body: PessoaCriarEntrada, response: { 201: PessoaSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criar(ator(req), req.body)))

    app.get('/:id', {
      ...loja(), preHandler: ver,
      schema: { params: IdParams, response: { 200: PessoaDetalheSaida } },
    }, async (req) => svc.detalhe(ator(req), req.params.id))

    app.patch('/:id', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, body: PessoaAtualizarEntrada, response: { 200: PessoaSaida } },
    }, async (req) => svc.atualizar(ator(req), req.params.id, req.body))

    // Telefone da pessoa (PII): revelar so dono/gerente, rate limit, sem cache.
    app.post('/:id/telefone/revelar', {
      ...loja({ rateLimit: { max: 10, timeWindow: '1 minute' } }),
      preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('dados_sensiveis:revelar')],
      schema: { params: IdParams, response: { 200: PessoaTelefoneSaida } },
    }, async (req, reply) => {
      void reply.header('cache-control', 'no-store')
      return svc.revelarTelefone(ator(req), req.params.id)
    })

    // --- Dados de entrega (so para a pessoa de cargo motoboy; grava a tabela motoboys) ---
    app.put('/:id/entrega', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, body: PessoaEntregaEntrada, response: { 200: PessoaEntregaSaida } },
    }, async (req) => svc.definirEntrega(ator(req), req.params.id, req.body))

    // Pix da entrega (PII): revelar so dono/gerente, rate limit, sem cache, auditado sem o valor.
    app.post('/:id/entrega/pix/revelar', {
      ...loja({ rateLimit: { max: 10, timeWindow: '1 minute' } }),
      preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('dados_sensiveis:revelar')],
      schema: { params: IdParams, response: { 200: PessoaEntregaPixSaida } },
    }, async (req, reply) => {
      void reply.header('cache-control', 'no-store')
      return svc.revelarPixEntrega(ator(req), req.params.id)
    })

    // --- Escalas (aninhadas na pessoa) ---
    app.get('/:id/escalas', {
      ...loja(), preHandler: ver,
      schema: { params: IdParams, response: { 200: EscalaListaSaida } },
    }, async (req) => svc.listarEscalas(ator(req), req.params.id))

    app.post('/:id/escalas', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, body: EscalaCriarEntrada, response: { 201: EscalaSaida } },
    }, async (req, reply) => reply.status(201).send(await svc.criarEscala(ator(req), req.params.id, req.body)))

    // Rotas finais: /v1/pessoas/escalas/:id (o prefixo do modulo e unico).
    app.patch('/escalas/:id', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, body: EscalaAtualizarEntrada, response: { 200: EscalaSaida } },
    }, async (req) => svc.atualizarEscala(ator(req), req.params.id, req.body))

    app.post('/escalas/:id/desativar', {
      ...loja(), preHandler: gerir,
      schema: { params: IdParams, response: { 200: EscalaSaida } },
    }, async (req) => svc.desativarEscala(ator(req), req.params.id))
  }
}

/** Plugin do registry: a cifra vem da MASTER_KEY da env (kernel @whaviso/shared/cifra). */
export const pessoasRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarPessoasRoutes()(instancia, opts)
