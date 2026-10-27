// App Fastify minimo de teste para exercitar o kernel de escopo (F3, etapa 11). Registra
// os plugins puros com um verificador FAKE (token = sub, desacopla do JWT real) e expoe
// rotas de demonstracao `/__teste/*`, que nao existem na app de producao.
import Fastify, { type FastifyInstance } from 'fastify'
import { tratadorDeErros } from '../src/shared/http_errors'
import { autenticarPlugin, type Verificador } from '../src/shared/auth'
import { escopoLojaPlugin, type LeitorEscopo } from '../src/shared/tenant'
import { escopoOperadorPlugin } from '../src/shared/operador'
import type { ExecutorAuditoria } from '../src/shared/eventos_auth'

/** Verificador fake: o bearer token E o user_id. Isola o escopo do JWT nos testes de tenant. */
export const verificadorFake: Verificador = {
  verificar: async (token: string) => {
    if (!token) throw new Error('vazio')
    return { sub: token }
  },
}

export interface OpcoesAppTeste {
  leitor: LeitorEscopo
  auditoria?: ExecutorAuditoria
}

export async function criarAppTeste(opcoes: OpcoesAppTeste): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  app.setErrorHandler(tratadorDeErros)

  await app.register(autenticarPlugin, { verificador: verificadorFake })
  await app.register(escopoLojaPlugin, { leitor: opcoes.leitor, auditoria: opcoes.auditoria })
  await app.register(escopoOperadorPlugin, { leitor: opcoes.leitor })

  // Rota de CONTEUDO de loja: exige membro; devolve o escopo resolvido.
  const rotaLoja = {
    config: { acesso: 'conteudo_de_loja' as const },
    preHandler: [app.autenticar, app.escopoLoja],
  }
  app.get('/__teste/loja', rotaLoja, async (req) => req.escopo)
  app.post('/__teste/loja', rotaLoja, async (req) => req.escopo)
  app.get(
    '/__teste/loja/:lojaId',
    { config: { acesso: 'conteudo_de_loja' as const }, preHandler: [app.autenticar, app.escopoLoja] },
    async (req) => req.escopo,
  )

  // Rota de PLATAFORMA: exige operador; conteudo de loja marcado aqui seria bloqueado.
  app.get(
    '/__teste/plataforma',
    { config: { acesso: 'plataforma' as const }, preHandler: [app.autenticar, app.escopoOperador] },
    async (req) => req.operador,
  )
  app.post(
    '/__teste/plataforma',
    { config: { acesso: 'plataforma' as const }, preHandler: [app.autenticar, app.escopoOperador] },
    async (req) => req.operador,
  )

  // Demonstra o bloqueio por padrao: operador valido em rota de CONTEUDO e negado.
  app.get(
    '/__teste/loja-operador',
    { config: { acesso: 'conteudo_de_loja' as const }, preHandler: [app.autenticar, app.escopoOperador] },
    async (req) => req.operador,
  )

  await app.ready()
  return app
}
