// Ponte de acesso assistido: o operador com consentimento ATIVO de uma loja alcanca o escopo
// READ-ONLY dela (so leitura, auditada). Sem consentimento, segue barrado (SEC-003). Teste sem
// banco: leitor e ponte sao fakes; a grade cai nos padroes do catalogo (sem fonte configurada).
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { tratadorDeErros } from '../http_errors'
import { autenticarPlugin, type Verificador } from '../auth'
import type { LeitorEscopo } from './leitor_escopo'
import { escopoLojaPlugin, type AcessoAssistido } from './plugin'
import { resetarGrade } from './grade'

// UUIDs validos (lerLojaSolicitada valida o formato do x-loja-id).
const LOJA_CONSENT = '11111111-1111-4111-8111-111111111111'
const LOJA_MEMBRO = '99999999-9999-4999-8999-999999999999'
const CONTA_CONSENT = '22222222-2222-4222-8222-222222222222'

/** Verificador fake: o bearer token E o user_id. */
const verificadorFake: Verificador = {
  verificar: async (token: string) => {
    if (!token) throw new Error('vazio')
    return { sub: token }
  },
}

// 'op' e operador sem vinculo de membro; 'membro' e gerente da LOJA_MEMBRO.
const leitor: LeitorEscopo = {
  lojasDoUsuario: async (userId) =>
    userId === 'membro'
      ? [{ conta_id: '33333333-3333-4333-8333-333333333333', loja_id: LOJA_MEMBRO, papel: 'gerente' }]
      : [],
  operadorDoUsuario: async (userId) => (userId === 'op' ? { papel: 'operador' } : null),
}

let usos: { acessoId: string; operadorUserId: string; lojaId: string; acao: string }[] = []

// Consentimento ativo so para LOJA_CONSENT.
const acessoAssistido: AcessoAssistido = {
  grantAtivo: async (lojaId) => (lojaId === LOJA_CONSENT ? { id: 'G1' } : null),
  contaDaLoja: async (lojaId) => (lojaId === LOJA_CONSENT ? CONTA_CONSENT : null),
  registrarUso: async (p) => {
    usos.push(p)
  },
}

async function montarApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  app.setErrorHandler(tratadorDeErros)
  await app.register(autenticarPlugin, { verificador: verificadorFake })
  await app.register(escopoLojaPlugin, { leitor, acessoAssistido })

  const conteudo = { config: { acesso: 'conteudo_de_loja' as const } }
  // Leitura (GET + :ver): o unico caminho que a sessao assistida libera.
  app.get(
    '/ver',
    { ...conteudo, preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('conversas:ver')] },
    async (req) => req.escopo,
  )
  // Escrita (metodo nao-GET, mesma permissao de leitura): assistido nao passa.
  app.post(
    '/ver',
    { ...conteudo, preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('conversas:ver')] },
    async (req) => req.escopo,
  )
  // GET de permissao que NAO e :ver: assistido nao passa.
  app.get(
    '/atender',
    { ...conteudo, preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('conversas:atender')] },
    async (req) => req.escopo,
  )
  // Dado sensivel (revelar telefone/Pix) nao e :ver: assistido nunca ve em claro.
  app.get(
    '/revelar',
    { ...conteudo, preHandler: [app.autenticar, app.escopoLoja, app.exigirPermissao('dados_sensiveis:revelar')] },
    async (req) => req.escopo,
  )
  await app.ready()
  return app
}

let app: FastifyInstance
beforeEach(async () => {
  usos = []
  resetarGrade()
  app = await montarApp()
})
afterEach(async () => {
  await app.close()
  resetarGrade()
})

const comoOp = (loja: string) => ({ authorization: 'Bearer op', 'x-loja-id': loja })

describe('ponte de acesso assistido', () => {
  it('operador com consentimento ativo LE o conteudo (GET :ver) e o uso e auditado', async () => {
    const r = await app.inject({ method: 'GET', url: '/ver', headers: comoOp(LOJA_CONSENT) })
    expect(r.statusCode).toBe(200)
    const escopo = r.json()
    expect(escopo.loja_ativa).toBe(LOJA_CONSENT)
    expect(escopo.conta_id).toBe(CONTA_CONSENT)
    expect(escopo.papel_por_loja).toEqual({}) // sem papel: so leitura
    expect(usos).toHaveLength(1)
    expect(usos[0]).toMatchObject({ acessoId: 'G1', operadorUserId: 'op', lojaId: LOJA_CONSENT })
    expect(usos[0]!.acao.startsWith('GET')).toBe(true)
  })

  it('sessao assistida e SOMENTE leitura: escrita (POST) na mesma permissao e 403', async () => {
    const r = await app.inject({ method: 'POST', url: '/ver', headers: comoOp(LOJA_CONSENT) })
    expect(r.statusCode).toBe(403)
  })

  it('sessao assistida nao passa em permissao que nao e :ver (conversas:atender)', async () => {
    const r = await app.inject({ method: 'GET', url: '/atender', headers: comoOp(LOJA_CONSENT) })
    expect(r.statusCode).toBe(403)
  })

  it('sessao assistida nunca revela dado sensivel (dados_sensiveis:revelar) mesmo em GET', async () => {
    const r = await app.inject({ method: 'GET', url: '/revelar', headers: comoOp(LOJA_CONSENT) })
    expect(r.statusCode).toBe(403)
  })

  it('operador SEM consentimento daquela loja e barrado (nao vira sessao assistida)', async () => {
    const r = await app.inject({ method: 'GET', url: '/ver', headers: comoOp(LOJA_MEMBRO) })
    expect(r.statusCode).toBe(403)
    expect(usos).toHaveLength(0)
  })

  it('operador sem x-loja-id nao abre sessao assistida', async () => {
    const r = await app.inject({ method: 'GET', url: '/ver', headers: { authorization: 'Bearer op' } })
    expect(r.statusCode).toBe(403)
    expect(usos).toHaveLength(0)
  })

  it('membro normal nao e afetado: le a propria loja pelo papel, sem auditoria de assistido', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/ver',
      headers: { authorization: 'Bearer membro', 'x-loja-id': LOJA_MEMBRO },
    })
    expect(r.statusCode).toBe(200)
    const escopo = r.json()
    expect(escopo.loja_ativa).toBe(LOJA_MEMBRO)
    expect(escopo.papel_por_loja[LOJA_MEMBRO]).toBe('gerente')
    expect(usos).toHaveLength(0)
  })

  it('membro escreve normalmente na propria loja (POST :ver), nao e read-only', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/ver',
      headers: { authorization: 'Bearer membro', 'x-loja-id': LOJA_MEMBRO },
    })
    expect(r.statusCode).toBe(200)
  })
})
