// Testes do modulo canais: unidade (mapeamento/validacao) e integracao no Postgres local (role
// whaviso_api). O provedor e simulado por FakeClienteCanal (sem rede). Cobre: credencial write-only
// e cifrada, permissoes (dono x gerente x atendente), multi-tenant, idempotencia, origem marcada,
// pedido invalido rejeitado, provedor nao integrado (501), falha do provedor (502) e sem credencial em log.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Writable } from 'node:stream'
import { criarCifra } from '@whaviso/shared/cifra'
import { criarLogger } from '@whaviso/shared/logger'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { FakeClienteCanal } from '@whaviso/shared/clientes'
import { StubClienteCanal } from '@whaviso/shared/clientes'
import { Transitorio } from '@whaviso/shared/clientes'
import { criarRotasCanais } from './routes'
import type { DepsCanais } from './config'

const env = envSchema.parse({
  DATABASE_URL: 'postgresql://whaviso_api:whaviso_api_dev@127.0.0.1:5432/whaviso_dev',
  SUPABASE_URL: 'https://exemplo.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_DESLIGADO: 'true',
})

const SENTINELA = 'tok-SENTINELA-CANAL-NAO-VAZA-0123456789'
const cifra = criarCifra('canais-master-key-de-teste-0123456789-abcdef')

const pedido = (id: string, extra: object = {}) => ({
  id_externo: id,
  criado_em: '2026-10-27T15:00:00.000Z',
  modalidade: 'entrega',
  itens: [
    { nome: 'Pizza Calabresa', quantidade: 2, preco_unitario_centavos: 4500 },
    { nome: 'Refrigerante', quantidade: 1, preco_unitario_centavos: 800 },
  ],
  subtotal_centavos: 9800,
  taxa_entrega_centavos: 700,
  total_centavos: 10500,
  ...extra,
})

const logs: string[] = []
const destino = new Writable({ write(c: Buffer, _e, cb) { logs.push(c.toString('utf8')); cb() } })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reg = Record<string, any>

describe('mapeamento de pedido externo', () => {
  it('schema aceita pedido canonico e rejeita campo extra, quantidade 0 e centavos fracionados', async () => {
    const { PedidoExterno } = await import('./schemas')
    expect(PedidoExterno.safeParse(pedido('a')).success).toBe(true)
    expect(PedidoExterno.safeParse({ ...pedido('a'), cliente_telefone: '+5511999998888' }).success).toBe(false)
    expect(PedidoExterno.safeParse(pedido('a', { itens: [{ nome: 'x', quantidade: 0, preco_unitario_centavos: 1 }] })).success).toBe(false)
    expect(PedidoExterno.safeParse(pedido('a', { total_centavos: 10.5 })).success).toBe(false)
  })
})

const d = (await bancoAcessivel()) ? describe : describe.skip

d('modulo canais (integracao)', () => {
  const cen = novoCenario()
  const fake = new FakeClienteCanal()
  const deps: DepsCanais = { cifra, clientes: { ifood: fake, outro: new StubClienteCanal() } }
  let app: Awaited<ReturnType<typeof construirApp>>
  let dono = '', gerente = '', atend = '', donoB = ''
  let lojaA = '', lojaB = ''

  const chamar = (user: string, loja: string, metodo: 'GET' | 'PUT' | 'PATCH' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/canais${url}`,
      headers: { authorization: `Bearer ${user}`, 'x-loja-id': loja },
      payload: payload as object | undefined,
    })
  const conectar = (user = dono, loja = lojaA, canal = 'ifood') =>
    chamar(user, loja, 'PUT', '/', { canal, credencial: SENTINELA, config: { merchant_id: 'm-1' } })

  beforeAll(async () => {
    dono = await criarUsuario(cen)
    gerente = await criarUsuario(cen)
    atend = await criarUsuario(cen)
    donoB = await criarUsuario(cen)
    const contaA = await criarConta(cen, dono)
    const contaB = await criarConta(cen, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, dono, 'dono', null)
    await criarMembro(contaA, gerente, 'gerente', lojaA)
    await criarMembro(contaA, atend, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    app = await construirApp({
      env: { ...env, RATE_LIMIT_DESLIGADO: true },
      pool: poolApi,
      logger: criarLogger('canais-teste', 'info', destino),
      verificador: verificadorFake,
      modulos: [{ prefixo: 'canais', plugin: criarRotasCanais(deps) }],
    })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    for (const l of [lojaA, lojaB]) {
      await poolSuper.query('delete from public.eventos where loja_id = $1', [l]).catch(() => {})
    }
    await limpar(cen)
    await fecharPools()
  })

  it('conecta: credencial nunca volta, fica cifrada e so os ultimos 4 aparecem', async () => {
    const r = await conectar()
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toMatchObject({ canal: 'ifood', ativo: true, ultimos4: '6789', config: { merchant_id: 'm-1' } })
    expect(r.body).not.toContain(SENTINELA)
    const lista = await chamar(dono, lojaA, 'GET', '/')
    expect(lista.body).not.toContain(SENTINELA)
    expect(lista.json().canais).toHaveLength(1)
    const { rows } = await poolSuper.query('select credencial_cifrada from public.canais_loja where loja_id = $1', [lojaA])
    expect(Buffer.from(rows[0].credencial_cifrada).includes(Buffer.from(SENTINELA))).toBe(false)
    expect(cifra.decifrar(rows[0].credencial_cifrada).toString('utf8')).toBe(SENTINELA)
  })

  it('credencial curta/campo extra/canal invalido = 400', async () => {
    expect((await chamar(dono, lojaA, 'PUT', '/', { canal: 'ifood', credencial: 'curta' })).statusCode).toBe(400)
    expect((await chamar(dono, lojaA, 'PUT', '/', { canal: 'rappi', credencial: SENTINELA })).statusCode).toBe(400)
    expect((await chamar(dono, lojaA, 'PUT', '/', { canal: 'ifood', credencial: SENTINELA, loja_id: lojaB })).statusCode).toBe(400)
  })

  it('permissoes: so o dono conecta; atendente nao ve nem sincroniza; gerente gerencia', async () => {
    expect((await conectar(gerente)).statusCode).toBe(403)
    expect((await conectar(atend)).statusCode).toBe(403)
    expect((await chamar(atend, lojaA, 'GET', '/')).statusCode).toBe(403)
    expect((await chamar(atend, lojaA, 'POST', '/ifood/sincronizar')).statusCode).toBe(403)
    expect((await chamar(gerente, lojaA, 'GET', '/')).statusCode).toBe(200)
    const p = await chamar(gerente, lojaA, 'PATCH', '/ifood', { config: { rotulo: 'Matriz' } })
    expect(p.statusCode).toBe(200)
    expect(p.json().config).toMatchObject({ rotulo: 'Matriz' })
  })

  it('multi-tenant: outra loja nao ve o canal, nao ajusta nem sincroniza (404) e nao acessa a loja alheia', async () => {
    expect((await chamar(donoB, lojaB, 'GET', '/')).json().canais).toHaveLength(0)
    expect((await chamar(donoB, lojaB, 'PATCH', '/ifood', { ativo: false })).statusCode).toBe(404)
    expect((await chamar(donoB, lojaB, 'POST', '/ifood/sincronizar')).statusCode).toBe(404)
    expect((await chamar(donoB, lojaA, 'GET', '/')).statusCode).toBeGreaterThanOrEqual(403)
  })

  it('sincroniza: importa pedido com origem ifood, itens snapshot, idempotente e confirma ao canal', async () => {
    fake.enfileirar(pedido('ext-1'), pedido('ext-2', { modalidade: 'retirada', taxa_entrega_centavos: 0, total_centavos: 9800 }))
    const r = await chamar(dono, lojaA, 'POST', '/ifood/sincronizar')
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toEqual({ importados: 2, duplicados: 0, rejeitados: 0 })
    expect(fake.confirmados).toEqual(['ext-1', 'ext-2'])

    const { rows } = await poolSuper.query(
      `select p.origem, p.status, p.total_centavos, p.subtotal_centavos, p.cliente_id, p.codigo,
              (select count(*)::int from public.itens_pedido i where i.pedido_id = p.id) as itens
         from public.canal_pedidos cp join public.pedidos p on p.id = cp.pedido_id
        where cp.loja_id = $1 and cp.id_externo = 'ext-1'`, [lojaA])
    expect(rows[0]).toMatchObject({ origem: 'ifood', status: 'novo', total_centavos: 10500, subtotal_centavos: 9800, cliente_id: null, itens: 2 })
    expect(rows[0].codigo).toMatch(/^IF-/)

    // Segunda rodada com os mesmos pedidos: nada novo.
    const r2 = await chamar(dono, lojaA, 'POST', '/ifood/sincronizar')
    expect(r2.json()).toEqual({ importados: 0, duplicados: 2, rejeitados: 0 })
    const { rows: n } = await poolSuper.query('select count(*)::int as n from public.pedidos where loja_id = $1', [lojaA])
    expect(n[0].n).toBe(2)

    const lista = await chamar(dono, lojaA, 'GET', '/pedidos')
    expect(lista.json().pedidos.map((p: Reg) => p.id_externo).sort()).toEqual(['ext-1', 'ext-2'])
    // loja B nao enxerga os pedidos importados da A
    expect((await chamar(donoB, lojaB, 'GET', '/pedidos')).json().pedidos).toHaveLength(0)
  })

  it('pedido invalido do provedor (total que nao confere, campo extra) e rejeitado sem derrubar o lote', async () => {
    fake.enfileirar(
      pedido('ext-ruim-1', { total_centavos: 1 }),
      { ...pedido('ext-ruim-2'), telefone: '+5511999998888' },
      pedido('ext-3'),
    )
    const r = await chamar(dono, lojaA, 'POST', '/ifood/sincronizar')
    expect(r.json()).toEqual({ importados: 1, duplicados: 2, rejeitados: 2 })
    const { rows } = await poolSuper.query("select count(*)::int as n from public.canal_pedidos where loja_id = $1 and id_externo like 'ext-ruim%'", [lojaA])
    expect(rows[0].n).toBe(0)
  })

  it('canal desativado nao sincroniza (422); falha do provedor = 502 e grava so o codigo', async () => {
    await chamar(dono, lojaA, 'PATCH', '/ifood', { ativo: false })
    expect((await chamar(dono, lojaA, 'POST', '/ifood/sincronizar')).statusCode).toBe(422)
    await chamar(dono, lojaA, 'PATCH', '/ifood', { ativo: true })
    fake.falharSempre(new Transitorio('boom com dado cru do provedor', { codigo: 'provedor_fora' }))
    const r = await chamar(dono, lojaA, 'POST', '/ifood/sincronizar')
    expect(r.statusCode).toBe(502)
    expect(r.body).not.toContain('boom')
    fake.falharSempre(undefined)
    const estado = (await chamar(dono, lojaA, 'GET', '/')).json().canais[0]
    expect(estado.ultimo_erro).toBe('provedor_fora')
  })

  it('canal sem provedor integrado (stub) responde 501', async () => {
    await conectar(dono, lojaA, 'outro')
    const r = await chamar(dono, lojaA, 'POST', '/outro/sincronizar')
    expect(r.statusCode).toBe(501)
    expect(r.json().error.code).toBe('canal_nao_integrado')
  })

  it('api nao apaga canais nem mapeamentos (sem DELETE)', async () => {
    await expect(poolApi.query('delete from public.canais_loja')).rejects.toThrow()
    await expect(poolApi.query('delete from public.canal_pedidos')).rejects.toThrow()
  })

  it('a credencial em claro nunca aparece em log', () => {
    expect(logs.join('\n')).not.toContain(SENTINELA)
  })
})
