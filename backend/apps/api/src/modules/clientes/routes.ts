import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { HttpError } from '../../shared/http_errors'
import { cifraPadrao, type Cifra } from './cripto'
import { criarServicoClientes, type Ator } from './service'
import {
  ClienteAtualizarEntrada, ClienteBuscaEntrada, ClienteBuscaTelefoneEntrada, ClienteCriarEntrada, ClienteDetalheSaida,
  ClienteConflitoSaida, ClienteListaSaida, ClienteSaida, EnderecoAtualizarEntrada, EnderecoEntrada, EnderecoListaSaida,
  EnderecoSaida, IdParams, TelefoneRevelarSaida, UltimoEnderecoSaida,
} from './schemas'

/** Loja efetiva = SO a do escopo resolvido (nunca corpo/query). */
function ator(req: FastifyRequest): Ator {
  const e = req.escopo
  if (!e?.loja_ativa) throw new HttpError(422, 'loja_ativa_obrigatoria', 'Informe a loja (x-loja-id)')
  return { lojaId: e.loja_ativa, userId: e.user_id }
}

/** Fabrica do plugin; `cifra` injetavel (testes). Padrao: cifra da MASTER_KEY (lazy). */
export function criarClientesRoutes(cifra?: Cifra): FastifyPluginAsync {
  return async (instancia) => {
    const app = instancia.withTypeProvider<ZodTypeProvider>()
    const svc = criarServicoClientes(app.pool, cifra ?? cifraPadrao())
    const loja = (extra: object = {}) => ({
      config: { acesso: 'conteudo_de_loja' as const, ...extra },
    })
    // Grade: ver clientes (convidado le) x gerir (cria/edita). A busca (POST) e leitura.
    const leitura = [app.autenticar, app.escopoLoja, app.exigirPermissao('clientes:ver')]
    const escrita = [app.autenticar, app.escopoLoja, app.exigirPermissao('clientes:gerir')]

    app.get('/', {
      ...loja({ rateLimit: { max: 60, timeWindow: '1 minute' } }),
      preHandler: leitura,
      schema: { querystring: ClienteBuscaEntrada, response: { 200: ClienteListaSaida } },
    }, async (req) => svc.listar(ator(req), req.query))

    // Busca por telefone completo (hash). POST para o numero nunca aparecer na URL/log de acesso.
    app.post('/buscar', {
      ...loja({ rateLimit: { max: 30, timeWindow: '1 minute' } }),
      preHandler: leitura,
      schema: { body: ClienteBuscaTelefoneEntrada, response: { 200: ClienteListaSaida } },
    }, async (req) => svc.buscarPorTelefone(ator(req), req.body))

    app.post('/', {
      ...loja(), preHandler: escrita,
      schema: { body: ClienteCriarEntrada, response: { 201: ClienteSaida, 409: ClienteConflitoSaida } },
    }, async (req, reply) => {
      const r = await svc.criar(ator(req), req.body)
      if (!r.criado) {
        return reply.status(409).send({
          error: { code: 'cliente_ja_existe', message: 'Ja existe cliente com este telefone' },
          cliente_id: r.id,
        })
      }
      return reply.status(201).send(r.cliente)
    })

    app.get('/:id', {
      ...loja(), preHandler: leitura,
      schema: { params: IdParams, response: { 200: ClienteDetalheSaida } },
    }, async (req) => svc.detalhe(ator(req), req.params.id))

    app.patch('/:id', {
      ...loja(), preHandler: escrita,
      schema: { params: IdParams, body: ClienteAtualizarEntrada, response: { 200: ClienteSaida } },
    }, async (req) => svc.atualizar(ator(req), req.params.id, req.body.nome))

    app.post('/:id/telefone/revelar', {
      ...loja({ rateLimit: { max: 10, timeWindow: '1 minute' } }),
      preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('dados_sensiveis:revelar')],
      schema: { params: IdParams, response: { 200: TelefoneRevelarSaida } },
    }, async (req, reply) => {
      void reply.header('cache-control', 'no-store')
      return svc.revelarTelefone(ator(req), req.params.id)
    })

    app.get('/:id/enderecos', {
      ...loja(), preHandler: leitura,
      schema: { params: IdParams, response: { 200: EnderecoListaSaida } },
    }, async (req) => svc.listarEnderecos(ator(req), req.params.id))

    app.post('/:id/enderecos', {
      ...loja(), preHandler: escrita,
      schema: { params: IdParams, body: EnderecoEntrada, response: { 201: EnderecoSaida } },
    }, async (req, reply) =>
      reply.status(201).send(await svc.criarEndereco(ator(req), req.params.id, req.body)))

    app.get('/:id/ultimo-endereco', {
      ...loja(), preHandler: leitura,
      schema: { params: IdParams, response: { 200: UltimoEnderecoSaida } },
    }, async (req) => svc.ultimoEndereco(ator(req), req.params.id))

    // Rotas finais: /v1/clientes/enderecos/:id (o prefixo do modulo e unico).
    app.patch('/enderecos/:id', {
      ...loja(), preHandler: escrita,
      schema: { params: IdParams, body: EnderecoAtualizarEntrada, response: { 200: EnderecoSaida } },
    }, async (req) => svc.atualizarEndereco(ator(req), req.params.id, req.body))

    app.post('/enderecos/:id/desativar', {
      ...loja(), preHandler: escrita,
      schema: { params: IdParams, response: { 200: EnderecoSaida } },
    }, async (req) => svc.desativarEndereco(ator(req), req.params.id))
  }
}

/** Plugin do registry: a cifra vem da MASTER_KEY da env (kernel @whaviso/shared/cifra). */
export const clientesRoutes: FastifyPluginAsync = async (instancia, opts) =>
  criarClientesRoutes()(instancia, opts)
