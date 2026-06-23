import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer u' }

describe('perfil: chaves Pix', () => {
  let userA: string
  let userB: string

  async function appA() {
    return criarAppTeste(userA)
  }

  async function criar(over: Record<string, unknown> = {}) {
    const app = await appA()
    const r = await app.inject({
      method: 'POST',
      url: '/v1/perfil/chaves-pix',
      headers: AUTH,
      payload: { tipo: 'email', chave: 'fulano@pix.com', ...over },
    })
    await app.close()
    return r
  }

  async function listar() {
    const app = await appA()
    const r = await app.inject({ method: 'GET', url: '/v1/perfil/chaves-pix', headers: AUTH })
    await app.close()
    return r.json() as Array<{ id: string; chave: string; padrao: boolean }>
  }

  beforeAll(async () => {
    userA = await criarUsuario('Dono A')
    userB = await criarUsuario('Dono B')
  })
  beforeEach(async () => {
    await poolSuper.query('delete from public.chaves_pix where profile_id = any($1)', [[userA, userB]])
  })
  afterAll(async () => {
    await limparUsuario(userA)
    await limparUsuario(userB)
    await encerrarPools()
  })

  it('sem token → 401', async () => {
    const app = await appA()
    const r = await app.inject({ method: 'GET', url: '/v1/perfil/chaves-pix' })
    await app.close()
    expect(r.statusCode).toBe(401)
  })

  it('lista vazia por padrão', async () => {
    expect(await listar()).toEqual([])
  })

  it('cria chave (201) e aparece na lista', async () => {
    const r = await criar({ rotulo: 'Nubank' })
    expect(r.statusCode).toBe(201)
    expect(r.json()).toMatchObject({ chave: 'fulano@pix.com', rotulo: 'Nubank', padrao: false, arquivada: false })
    expect(await listar()).toHaveLength(1)
  })

  it('só uma chave padrão por vez; padrão vem primeiro na lista', async () => {
    await criar({ chave: 'a@pix.com', padrao: true })
    await criar({ chave: 'b@pix.com', padrao: true })
    const lista = await listar()
    expect(lista.filter((c) => c.padrao)).toHaveLength(1)
    expect(lista[0]!.chave).toBe('b@pix.com')
    expect(lista[0]!.padrao).toBe(true)
  })

  it('chave ativa duplicada → 409 chave_pix_duplicada', async () => {
    await criar({ chave: 'dup@pix.com' })
    const r = await criar({ chave: 'dup@pix.com' })
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('chave_pix_duplicada')
  })

  it('PATCH torna outra chave a padrão (troca o padrão)', async () => {
    await criar({ chave: 'a@pix.com', padrao: true })
    const segunda = (await criar({ chave: 'b@pix.com' })).json()
    const app = await appA()
    const r = await app.inject({
      method: 'PATCH',
      url: `/v1/perfil/chaves-pix/${segunda.id}`,
      headers: AUTH,
      payload: { padrao: true },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    const lista = await listar()
    expect(lista.filter((c) => c.padrao)).toHaveLength(1)
    expect(lista.find((c) => c.chave === 'b@pix.com')?.padrao).toBe(true)
  })

  it('PATCH arquivada=true some da lista e perde o padrão (soft-delete)', async () => {
    const chave = (await criar({ chave: 'arq@pix.com', padrao: true })).json()
    const app = await appA()
    const r = await app.inject({
      method: 'PATCH',
      url: `/v1/perfil/chaves-pix/${chave.id}`,
      headers: AUTH,
      payload: { arquivada: true },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().padrao).toBe(false)
    expect(await listar()).toEqual([])
  })

  it('chave arquivada libera o unique: pode recriar a mesma chave', async () => {
    const chave = (await criar({ chave: 'recria@pix.com' })).json()
    const app = await appA()
    await app.inject({
      method: 'PATCH',
      url: `/v1/perfil/chaves-pix/${chave.id}`,
      headers: AUTH,
      payload: { arquivada: true },
    })
    await app.close()
    const r = await criar({ chave: 'recria@pix.com' })
    expect(r.statusCode).toBe(201)
  })

  it('escopo por usuário: B não enxerga nem altera chave de A → 404', async () => {
    const chave = (await criar({ chave: 'so-de-A@pix.com' })).json()
    const appB = await criarAppTeste(userB)
    const r = await appB.inject({
      method: 'PATCH',
      url: `/v1/perfil/chaves-pix/${chave.id}`,
      headers: AUTH,
      payload: { rotulo: 'invasor' },
    })
    await appB.close()
    expect(r.statusCode).toBe(404)
  })
})
