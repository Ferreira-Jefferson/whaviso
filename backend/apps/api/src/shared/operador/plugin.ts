// Plugin Fastify de escopo de operador da plataforma (F3, etapa 9). O operador (equipe
// Whaviso) ve metrica e faturamento, NUNCA conteudo de loja (conversas, pedidos,
// mensagens). Esse limite e imposto aqui, por aplicacao, nao por RLS.
//
// BLOQUEIO POR PADRAO (SEC-003): uma rota marcada `acesso: 'conteudo_de_loja'` e negada
// mesmo para um operador valido; so rotas `plataforma` passam. Assim, esquecer de proteger
// uma rota de conteudo nao abre o conteudo ao operador: ele cai no default (negar).
//
// Plugin PURO (`fastify-plugin`); F4 registra injetando o `LeitorEscopo`.
import fp from 'fastify-plugin'
import type {
  FastifyContextConfig,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify'
import type { EscopoOperador } from '@whaviso/shared/contracts'
import { naoAutorizado, proibido } from '../http_errors'
import type { LeitorEscopo } from '../tenant'

export interface OpcoesEscopoOperador {
  leitor: LeitorEscopo
}

/** Classificacao de acesso da rota. Default (ausente) e tratado como conteudo (fechado). */
export type AcessoRota = 'plataforma' | 'conteudo_de_loja'

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Marca a audiencia da rota. Operador so alcanca 'plataforma'. */
    acesso?: AcessoRota
  }
  interface FastifyRequest {
    /** Escopo de operador resolvido; null ate `escopoOperador` rodar com sucesso. */
    operador: EscopoOperador | null
  }
  interface FastifyInstance {
    escopoOperador: preHandlerHookHandler
  }
}

const plugin: FastifyPluginAsync<OpcoesEscopoOperador> = async (app, opcoes) => {
  app.decorateRequest('operador', null)

  app.decorate('escopoOperador', async (req: FastifyRequest, reply: FastifyReply) => {
    // Bloqueio por padrao: so segue em rota explicitamente 'plataforma'. Qualquer outra
    // coisa (conteudo_de_loja ou rota sem marca) e negada ao operador.
    const config = req.routeOptions.config as FastifyContextConfig
    if (config.acesso !== 'plataforma') {
      throw proibido('Operador nao acessa conteudo de loja')
    }

    const userId = req.usuario?.user_id
    if (!userId) throw naoAutorizado()

    let operador
    try {
      operador = await opcoes.leitor.operadorDoUsuario(userId)
    } catch {
      // Falha fechada: sem confirmar o vinculo de operador, nega.
      throw proibido('Nao foi possivel resolver o escopo de operador')
    }
    if (!operador) throw proibido('Acesso restrito a operadores da plataforma')

    req.operador = { tipo: 'operador', user_id: userId, papel: operador.papel }
    reply.header('cache-control', 'no-store')
  })
}

export const escopoOperadorPlugin = fp(plugin, {
  name: 'whaviso-escopo-operador',
  dependencies: ['whaviso-autenticar'],
})
