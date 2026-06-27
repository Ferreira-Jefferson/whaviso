import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  creditarConta,
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer u' }

// H1.2/H1.3: /auth/status-telefone diz se o número já tem cadastro (a UI escolhe a
// copy login vs cadastro). Rota pública, audita só o hash do telefone (sem PII).
describe('auth: status-telefone (H1.2/H1.3)', () => {
  let comConta: string
  const TEL_EXISTE = '+5511970002233'
  const TEL_NOVO = '+5511970009988'

  beforeAll(async () => {
    comConta = await criarUsuario('Tem Conta')
    await poolSuper.query(`update public.profiles set telefone = $2 where id = $1`, [
      comConta,
      TEL_EXISTE,
    ])
  })
  afterAll(async () => {
    await poolSuper.query(`delete from public.eventos_auth`)
    await limparUsuario(comConta)
  })

  it('número já cadastrado → { existe: true, metodo: null }', async () => {
    const app = await criarAppTeste(null)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/status-telefone',
      payload: { telefone: TEL_EXISTE },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    // metodo: null porque o usuário de teste não tem entrada em auth.identities.
    expect(r.json()).toEqual({ existe: true, metodo: null })
  })

  it('número novo → { existe: false, metodo: null }', async () => {
    const app = await criarAppTeste(null)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/status-telefone',
      payload: { telefone: TEL_NOVO },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ existe: false, metodo: null })
  })

  it('audita só o HASH do telefone (nunca o número em claro)', async () => {
    const app = await criarAppTeste(null)
    await app.inject({
      method: 'POST',
      url: '/v1/auth/status-telefone',
      payload: { telefone: TEL_EXISTE },
    })
    await app.close()
    const hash = createHash('sha256').update(TEL_EXISTE).digest('hex')
    const ev = await poolSuper.query<{ telefone_hash: string; detalhes: unknown }>(
      `select telefone_hash, detalhes from public.eventos_auth
       where tipo = 'status_consultado' order by id desc limit 1`,
    )
    expect(ev.rows[0]?.telefone_hash).toBe(hash)
    // O número em claro nunca aparece em nenhuma coluna do evento.
    expect(JSON.stringify(ev.rows[0])).not.toContain(TEL_EXISTE)
    expect(JSON.stringify(ev.rows[0])).not.toContain('970002233')
  })

  it('telefone fora de E.164 → 400 (validação de contrato)', async () => {
    const app = await criarAppTeste(null)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/status-telefone',
      payload: { telefone: '11999998888' },
    })
    await app.close()
    expect(r.statusCode).toBe(400)
  })
})

// E11 H11.2/H11.4: o Free LÊ (200) e CRIA dentro do saldo (cortesia 5 envios); sem saldo,
// a ativação é recusada (saldo_insuficiente), não por plano. H1.6/H1.7 confirmam 401 sem
// token. A conta NASCE Free com a cortesia (handle_new_user + creditos_carteira).
describe('auth: Free cria dentro do saldo (E11) + sessão (H1.6)', () => {
  let free: string

  function corpoAviso(over: Record<string, unknown> = {}) {
    return {
      direcao: 'receber',
      nome_devedor: 'Maria',
      telefone_devedor: '+5511999998888',
      motivo: 'mensalidade',
      valor_centavos: 9900,
      data_combinada: '2026-12-15',
      pix_chave: 'maria@pix.com',
      pix_titular: 'Maria Silva',
      pix_banco: 'Banco Exemplo',
      ...over,
    }
  }

  beforeAll(async () => {
    free = await criarUsuario('Free Leitura') // nasce free
  })
  afterAll(async () => {
    await limparUsuario(free)
    await encerrarPools()
  })

  it('H1.6: rota protegida sem token → 401 com envelope { error: { code } }', async () => {
    const app = await criarAppTeste(free)
    const r = await app.inject({ method: 'GET', url: '/v1/avisos' })
    await app.close()
    expect(r.statusCode).toBe(401)
    expect(r.json().error.code).toBe('nao_autorizado')
  })

  it('H1.5: free LÊ a lista de avisos (200)', async () => {
    const app = await criarAppTeste(free)
    const r = await app.inject({ method: 'GET', url: '/v1/avisos', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(Array.isArray(r.json().itens)).toBe(true)
  })

  it('E11: Free CRIA dentro do saldo de cortesia (receber) → 201', async () => {
    // Conta nasce com cortesia 5; o primeiro aviso (modo enviar) reserva 1 e passa.
    const novo = await criarUsuario('Free Cria')
    const app = await criarAppTeste(novo)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoAviso(),
    })
    await app.close()
    expect(r.statusCode).toBe(201)
    await limparUsuario(novo)
  })

  it('E11: Free sem saldo NÃO ativa → 422 saldo_insuficiente (não por plano)', async () => {
    // Zera a cortesia (5) reservando 5 avisos; o 6º falha por saldo, não por plano.
    const semSaldo = await criarUsuario('Free Sem Saldo')
    const app = await criarAppTeste(semSaldo)
    for (let i = 0; i < 5; i++) {
      const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
      expect(r.statusCode).toBe(201)
    }
    const r6 = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    expect(r6.statusCode).toBe(422)
    expect(r6.json().error.code).toBe('saldo_insuficiente')
    await limparUsuario(semSaldo)
  })

  it('E11: ao receber crédito, a MESMA conta volta a criar (201)', async () => {
    const conta = await criarUsuario('Free Recarrega')
    const app = await criarAppTeste(conta)
    // Esgota a cortesia.
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    }
    const semSaldo = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    expect(semSaldo.statusCode).toBe(422)
    // Owner credita; agora cria de novo.
    await creditarConta(conta, 3)
    const ok = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoAviso() })
    await app.close()
    expect(ok.statusCode).toBe(201)
    await limparUsuario(conta)
  })
})
