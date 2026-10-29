// Integracao: bootstrap, conta, matriz de papeis e membros (SEC-001/041/081).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { bancoAcessivel, fecharPools, limpar } from '../../../test/db'
import {
  aprovarAcesso,
  criarAppConta,
  type App,
  criarChamador,
  criarMembro,
  criarUsuario,
  montar,
  novoCenario,
  poolSuper,
} from './harness'

const online = await bancoAcessivel()
const d = online ? describe : describe.skip

d('conta e membros (integracao)', () => {
  let app: App
  let chamar: ReturnType<typeof criarChamador>
  const c = novoCenario()

  beforeAll(async () => {
    app = await criarAppConta()
    chamar = criarChamador(app)
  })
  afterAll(async () => {
    await app?.close()
    await limpar(c)
    await fecharPools()
  })

  describe('bootstrap', () => {
    it('cria conta + dono (loja_id NULL), audita e e idempotente', async () => {
      const u = await criarUsuario(c)
      await aprovarAcesso(u)
      const r1 = await chamar(u, 'POST', '/', { nome: 'Pizzaria' })
      expect(r1.statusCode).toBe(201)
      const conta = r1.json()
      c.contas.push(conta.id)
      const r2 = await chamar(u, 'POST', '/', { nome: 'Outra' })
      expect(r2.statusCode).toBe(200)
      expect(r2.json().id).toBe(conta.id)
      const { rows } = await poolSuper.query(
        'select loja_id, papel from public.membros where conta_id = $1',
        [conta.id],
      )
      expect(rows).toEqual([{ loja_id: null, papel: 'dono' }])
      const ev = await poolSuper.query('select tipo from public.eventos where entidade_id = $1', [conta.id])
      expect(ev.rows.map((x) => x.tipo)).toContain('conta.criada')
    })

    it('criacoes concorrentes do mesmo usuario geram uma conta so', async () => {
      const u = await criarUsuario(c)
      await aprovarAcesso(u)
      const rs = await Promise.all([1, 2, 3].map(() => chamar(u, 'POST', '/', { nome: 'X' })))
      const ids = new Set(rs.map((r) => r.json().id))
      expect(ids.size).toBe(1)
      c.contas.push([...ids][0] as string)
    })

    it('exige autenticacao e corpo estrito (SEC-081)', async () => {
      expect((await chamar(null, 'POST', '/', { nome: 'x' })).statusCode).toBe(401)
      const u = await criarUsuario(c)
      const ruim = await chamar(u, 'POST', '/', { nome: 'x', dono_user_id: u })
      expect(ruim.statusCode).toBe(400)
      expect(ruim.json().error.code).toBe('entrada_invalida')
      expect((await chamar(u, 'POST', '/', { nome: '' }, '10.9.9.9')).statusCode).toBe(400)
    })

    it('POST /conta tem rate limit proprio (SEC-101)', async () => {
      const u = await criarUsuario(c)
      const codigos: number[] = []
      for (let i = 0; i < 12; i++) codigos.push((await chamar(u, 'POST', '/', { nome: '' }, '10.9.9.9')).statusCode)
      expect(codigos.at(-1)).toBe(429)
    })

    it('usuario sem conta recebe 403 sem_conta nas demais rotas', async () => {
      const u = await criarUsuario(c)
      for (const [m, url] of [['GET', '/'], ['GET', '/membros'], ['GET', '/convites']] as const) {
        const r = await chamar(u, m, url)
        expect(r.statusCode).toBe(403)
        expect(r.json().error.code).toBe('sem_conta')
      }
    })
  })

  describe('matriz papel x endpoint', () => {
    it('dono le e renomeia; gerente e atendente negados onde devem', async () => {
      const t = await montar(c)
      const ger = await criarUsuario(c)
      await criarMembro(t.contaId, ger, 'gerente', null)
      const at = await criarUsuario(c)
      await criarMembro(t.contaId, at, 'atendente', t.lojaA)

      expect((await chamar(t.dono, 'GET', '/')).statusCode).toBe(200)
      expect((await chamar(t.dono, 'PATCH', '/', { nome: 'Novo' })).json().nome).toBe('Novo')
      for (const u of [ger, at]) {
        const r = await chamar(u, 'PATCH', '/', { nome: 'Hack' })
        expect(r.statusCode).toBe(403)
        expect(r.json().error.code).toBe('proibido')
        expect((await chamar(u, 'GET', '/')).statusCode).toBe(403)
      }
      expect((await chamar(t.dono, 'GET', '/membros')).statusCode).toBe(200)
      expect((await chamar(ger, 'GET', '/membros')).statusCode).toBe(200)
      expect((await chamar(at, 'GET', '/membros')).statusCode).toBe(403)
      expect((await chamar(at, 'GET', '/convites')).statusCode).toBe(403)
      expect((await chamar(at, 'POST', '/convites', { papel: 'atendente' })).statusCode).toBe(403)
    })
  })

  describe('membros', () => {
    it('SEC-001: nao lista membros nem convites de outra conta; id de outra conta e 404', async () => {
      const a = await montar(c)
      const b = await montar(c)
      const lista = (await chamar(a.dono, 'GET', '/membros')).json().membros
      expect(lista.map((m: { id: string }) => m.id)).toEqual([a.donoMembro])
      await chamar(b.dono, 'POST', '/convites', { papel: 'atendente' })
      expect((await chamar(a.dono, 'GET', '/convites')).json().convites).toEqual([])
      const r = await chamar(a.dono, 'PATCH', `/membros/${b.donoMembro}`, { ativo: false })
      expect(r.statusCode).toBe(404)
    })

    it('guarda do ultimo dono, auto-alteracao e rebaixar outro dono', async () => {
      const t = await montar(c)
      const solo = await chamar(t.dono, 'PATCH', `/membros/${t.donoMembro}`, { papel: 'gerente' })
      expect(solo.statusCode).toBe(409)
      expect(solo.json().error.code).toBe('ultimo_dono')

      const outro = await criarUsuario(c)
      const outroM = await criarMembro(t.contaId, outro, 'atendente', null)
      expect((await chamar(t.dono, 'PATCH', `/membros/${outroM}`, { papel: 'dono' })).statusCode).toBe(200)
      const auto = await chamar(t.dono, 'PATCH', `/membros/${t.donoMembro}`, { papel: 'gerente' })
      expect(auto.statusCode).toBe(403)
      expect(auto.json().error.code).toBe('auto_alteracao')
      const reb = await chamar(t.dono, 'PATCH', `/membros/${outroM}`, { papel: 'atendente', ativo: false })
      expect(reb.statusCode).toBe(200)
      expect(reb.json()).toMatchObject({ papel: 'atendente', ativo: false })
      const ev = await poolSuper.query('select tipo from public.eventos where entidade_id = $1', [outroM])
      expect(ev.rows.map((x) => x.tipo)).toEqual(
        expect.arrayContaining(['membro.papel_alterado', 'membro.removido']),
      )
    })

    it('gerente nao altera dono, nao promove a dono e fica no seu alcance', async () => {
      const t = await montar(c)
      const ger = await criarUsuario(c)
      await criarMembro(t.contaId, ger, 'gerente', t.lojaA)
      const atA = await criarMembro(t.contaId, await criarUsuario(c), 'atendente', t.lojaA)
      const atB = await criarMembro(t.contaId, await criarUsuario(c), 'atendente', t.lojaB)

      expect((await chamar(ger, 'PATCH', `/membros/${t.donoMembro}`, { ativo: false })).statusCode).toBe(409)
      expect((await chamar(ger, 'PATCH', `/membros/${atA}`, { papel: 'dono' })).statusCode).toBe(403)
      expect((await chamar(ger, 'PATCH', `/membros/${atB}`, { ativo: false })).statusCode).toBe(403)
      expect((await chamar(ger, 'PATCH', `/membros/${atA}`, { papel: 'gerente' })).statusCode).toBe(200)
      const ids = (await chamar(ger, 'GET', '/membros')).json().membros.map((m: { id: string }) => m.id)
      expect(ids).toContain(atA)
      expect(ids).not.toContain(atB)
      expect(ids).not.toContain(t.donoMembro)
    })

    it('gerente nao mexe em dono quando ha outro dono', async () => {
      const t = await montar(c)
      await criarMembro(t.contaId, await criarUsuario(c), 'dono', null)
      const ger = await criarUsuario(c)
      await criarMembro(t.contaId, ger, 'gerente', null)
      const r = await chamar(ger, 'PATCH', `/membros/${t.donoMembro}`, { ativo: false })
      expect(r.statusCode).toBe(403)
      expect(r.json().error.code).toBe('apenas_dono')
    })

    // Trava do comportamento INTENCIONAL da fonte da verdade (historias/backend-api/conta.md,
    // etapas 7-8): gestao de membros e de dono E gerente; gerente promove ate gerente, nunca a dono.
    // Em conjunto, confirma que a authz do service e aplicada chamando a rota direto (B3).
    it('gerente (alcance todas) gere e promove ate gerente, nunca a dono; atendente nao gere', async () => {
      const t = await montar(c)
      const ger = await criarUsuario(c)
      await criarMembro(t.contaId, ger, 'gerente', null)
      const alvo = await criarMembro(t.contaId, await criarUsuario(c), 'atendente', null)
      const at = await criarUsuario(c)
      await criarMembro(t.contaId, at, 'atendente', t.lojaA)

      // historia etapa 7: gerente PODE promover a gerente...
      expect((await chamar(ger, 'PATCH', `/membros/${alvo}`, { papel: 'gerente' })).statusCode).toBe(200)
      // ...mas nunca a dono.
      const aDono = await chamar(ger, 'PATCH', `/membros/${alvo}`, { papel: 'dono' })
      expect(aDono.statusCode).toBe(403)
      expect(aDono.json().error.code).toBe('apenas_dono')
      // B3: a authz vive no service; atendente chamando a rota de mutacao direto e barrado (gestor).
      expect((await chamar(at, 'PATCH', `/membros/${alvo}`, { ativo: false })).statusCode).toBe(403)
    })

    it('SEC-041/081: papel fora do enum e corpo invalido sao negados; sem promocao a operador', async () => {
      const t = await montar(c)
      const m = await criarMembro(t.contaId, await criarUsuario(c), 'atendente', null)
      for (const papel of ['operador', 'admin']) {
        expect((await chamar(t.dono, 'PATCH', `/membros/${m}`, { papel })).statusCode).toBe(400)
        expect((await chamar(t.dono, 'POST', '/convites', { papel })).statusCode).toBe(400)
      }
      expect((await chamar(t.dono, 'PATCH', `/membros/${m}`, {})).statusCode).toBe(400)
      expect((await chamar(t.dono, 'PATCH', '/membros/nao-uuid', { ativo: false })).statusCode).toBe(400)
      expect((await chamar(t.dono, 'POST', '/convites', { papel: 'atendente', loja_id: 'x' })).statusCode).toBe(400)
      const { rows } = await poolSuper.query(
        'select count(*)::int as n from public.operadores where user_id = $1',
        [t.dono],
      )
      expect(rows[0].n).toBe(0)
    })
  })
})
