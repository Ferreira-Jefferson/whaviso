// Suite de seguranca do kernel de escopo (F3): SEC-001/002/003/041 + revogacao, contra o
// Postgres LOCAL whaviso_dev. Mais o fail-closed, que nao precisa de banco.
import { describe, it, expect, afterAll, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  bancoAcessivel,
  fecharPools,
  poolApi,
  novoCenario,
  criarUsuario,
  criarConta,
  criarLoja,
  criarMembro,
  criarOperador,
  contarOperadores,
  desativarMembro,
  limpar,
  type Cenario,
} from './db'
import { criarAppTeste } from './app'
import { criarLeitorEscopoSql, type LeitorEscopo } from '../src/shared/tenant'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) {
  console.warn('[F3] whaviso_dev inacessivel: SEC-001/002/003/041 PULADOS (rode validate_migrations).')
}

function bearer(userId: string): Record<string, string> {
  return { authorization: `Bearer ${userId}` }
}

d('kernel de escopo multi-tenant (integracao)', () => {
  const leitor = criarLeitorEscopoSql(poolApi)
  let app: FastifyInstance
  let cenario: Cenario

  afterEach(async () => {
    if (app) await app.close()
    if (cenario) await limpar(cenario)
  })
  afterAll(async () => {
    await fecharPools()
  })

  async function montar(): Promise<FastifyInstance> {
    app = await criarAppTeste({ leitor, auditoria: poolApi })
    return app
  }

  it('SEC-001: membro de A nao alcanca loja de B (404), e so ve as proprias lojas', async () => {
    cenario = novoCenario()
    const userA = await criarUsuario(cenario)
    const contaA = await criarConta(cenario, userA)
    const lojaA = await criarLoja(contaA)
    const userB = await criarUsuario(cenario)
    const contaB = await criarConta(cenario, userB)
    const lojaB = await criarLoja(contaB)
    await criarMembro(contaA, userA, 'dono', lojaA)
    await montar()

    // Pedir loja de B pelo header: 404 (nao vaza existencia), nunca o dado.
    const forjado = await app.inject({
      method: 'GET',
      url: '/__teste/loja',
      headers: { ...bearer(userA), 'x-loja-id': lojaB },
    })
    expect(forjado.statusCode).toBe(404)

    // Sem header: escopo contem SO a loja A.
    const proprio = await app.inject({ method: 'GET', url: '/__teste/loja', headers: bearer(userA) })
    expect(proprio.statusCode).toBe(200)
    const escopo = proprio.json()
    expect(escopo.loja_ids).toEqual([lojaA])
    expect(escopo.loja_ids).not.toContain(lojaB)
  })

  it('SEC-001: membro com loja_id NULL ve todas as lojas da conta, nunca de outra', async () => {
    cenario = novoCenario()
    const dono = await criarUsuario(cenario)
    const contaA = await criarConta(cenario, dono)
    const lojaA1 = await criarLoja(contaA)
    const lojaA2 = await criarLoja(contaA)
    const lojaInativa = await criarLoja(contaA, false)
    const outro = await criarUsuario(cenario)
    const contaB = await criarConta(cenario, outro)
    const lojaB = await criarLoja(contaB)
    await criarMembro(contaA, dono, 'dono', null) // NULL = todas as lojas da conta
    await montar()

    const res = await app.inject({ method: 'GET', url: '/__teste/loja', headers: bearer(dono) })
    expect(res.statusCode).toBe(200)
    const escopo = res.json()
    expect(escopo.loja_ids.sort()).toEqual([lojaA1, lojaA2].sort())
    expect(escopo.loja_ids).not.toContain(lojaB)
    expect(escopo.loja_ids).not.toContain(lojaInativa) // loja inativa fica de fora
  })

  it('SEC-002: loja_id forjado no corpo/query nao muda a loja efetiva', async () => {
    cenario = novoCenario()
    const userA = await criarUsuario(cenario)
    const contaA = await criarConta(cenario, userA)
    const lojaA = await criarLoja(contaA)
    const userB = await criarUsuario(cenario)
    const contaB = await criarConta(cenario, userB)
    const lojaB = await criarLoja(contaB)
    await criarMembro(contaA, userA, 'dono', lojaA)
    await montar()

    // Corpo e query tentam injetar a loja de B; devem ser ignorados.
    const res = await app.inject({
      method: 'POST',
      url: `/__teste/loja?loja_id=${lojaB}`,
      headers: bearer(userA),
      payload: { loja_id: lojaB },
    })
    expect(res.statusCode).toBe(200)
    const escopo = res.json()
    expect(escopo.loja_ids).toEqual([lojaA])
    expect(escopo.loja_ativa).toBeNull() // nada do corpo/query virou loja ativa

    // So o header valido (loja do proprio escopo) fixa a loja ativa; corpo forjado segue ignorado.
    const comHeader = await app.inject({
      method: 'POST',
      url: '/__teste/loja',
      headers: { ...bearer(userA), 'x-loja-id': lojaA },
      payload: { loja_id: lojaB },
    })
    expect(comHeader.json().loja_ativa).toBe(lojaA)
  })

  it('SEC-003: operador nao acessa conteudo de loja; so plataforma', async () => {
    cenario = novoCenario()
    const op = await criarUsuario(cenario)
    await criarOperador(op, 'operador')
    await montar()

    // Rota de conteudo (exige membro): operador nao tem vinculo -> negado.
    const conteudo = await app.inject({ method: 'GET', url: '/__teste/loja', headers: bearer(op) })
    expect(conteudo.statusCode).toBe(403)

    // Rota de conteudo marcada mas guardada por escopoOperador: bloqueio por padrao.
    const conteudoOp = await app.inject({
      method: 'GET',
      url: '/__teste/loja-operador',
      headers: bearer(op),
    })
    expect(conteudoOp.statusCode).toBe(403)

    // Rota de plataforma: passa.
    const plataforma = await app.inject({
      method: 'GET',
      url: '/__teste/plataforma',
      headers: bearer(op),
    })
    expect(plataforma.statusCode).toBe(200)
    expect(plataforma.json().papel).toBe('operador')
  })

  it('SEC-041: membro nao vira operador por payload nem por rota; nada o promove', async () => {
    cenario = novoCenario()
    const userA = await criarUsuario(cenario)
    const contaA = await criarConta(cenario, userA)
    const lojaA = await criarLoja(contaA)
    await criarMembro(contaA, userA, 'dono', lojaA)
    await montar()

    // Membro tentando acessar plataforma com papel forjado no corpo: negado.
    const res = await app.inject({
      method: 'POST',
      url: '/__teste/plataforma',
      headers: bearer(userA),
      payload: { papel: 'admin', operador: true },
    })
    expect(res.statusCode).toBe(403)

    // E o kernel NUNCA criou linha em operadores (so le, nunca escreve).
    expect(await contarOperadores(userA)).toBe(0)
  })

  it('revogacao: membro desativado perde acesso na requisicao seguinte', async () => {
    cenario = novoCenario()
    const userA = await criarUsuario(cenario)
    const contaA = await criarConta(cenario, userA)
    const lojaA = await criarLoja(contaA)
    const membroId = await criarMembro(contaA, userA, 'gerente', lojaA)
    await montar()

    const antes = await app.inject({ method: 'GET', url: '/__teste/loja', headers: bearer(userA) })
    expect(antes.statusCode).toBe(200)

    await desativarMembro(membroId)
    const depois = await app.inject({ method: 'GET', url: '/__teste/loja', headers: bearer(userA) })
    expect(depois.statusCode).toBe(403)
  })
})

describe('kernel de escopo: falha fechada (sem banco)', () => {
  const leitorQuebrado: LeitorEscopo = {
    lojasDoUsuario: async () => {
      throw new Error('banco de escopo fora do ar')
    },
    operadorDoUsuario: async () => {
      throw new Error('banco de escopo fora do ar')
    },
  }

  it('escopo de loja nega (503) quando a leitura falha, sem vazar dado', async () => {
    const app = await criarAppTeste({ leitor: leitorQuebrado })
    const res = await app.inject({
      method: 'GET',
      url: '/__teste/loja',
      headers: { authorization: 'Bearer 44444444-4444-4444-4444-444444444444' },
    })
    expect(res.statusCode).toBe(503)
    expect(res.json().error.code).toBe('escopo_indisponivel')
    await app.close()
  })

  it('escopo de operador nega (403) quando a leitura falha', async () => {
    const app = await criarAppTeste({ leitor: leitorQuebrado })
    const res = await app.inject({
      method: 'GET',
      url: '/__teste/plataforma',
      headers: { authorization: 'Bearer 44444444-4444-4444-4444-444444444444' },
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('sem Bearer: 401 em rota protegida', async () => {
    const app = await criarAppTeste({ leitor: leitorQuebrado })
    const res = await app.inject({ method: 'GET', url: '/__teste/loja' })
    expect(res.statusCode).toBe(401)
    await app.close()
  })
})
