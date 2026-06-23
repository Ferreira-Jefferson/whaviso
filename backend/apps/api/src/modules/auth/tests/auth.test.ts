import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import {
  criarAppTeste,
  criarUsuario,
  definirPlano,
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

  it('número já cadastrado → { existe: true }', async () => {
    const app = await criarAppTeste(null)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/status-telefone',
      payload: { telefone: TEL_EXISTE },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ existe: true })
  })

  it('número novo → { existe: false }', async () => {
    const app = await criarAppTeste(null)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/auth/status-telefone',
      payload: { telefone: TEL_NOVO },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json()).toEqual({ existe: false })
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

// H1.5: o plano FREE LÊ (200) mas não CRIA (403/422 plano_somente_leitura). H1.6/H1.7
// confirmam 401 sem token. A conta NASCE free (handle_new_user), sem subir o plano.
describe('auth: plano free é só-leitura (H1.5) + sessão (H1.6)', () => {
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

  it('H1.5: free NÃO cria (receber) → 422 plano_somente_leitura', async () => {
    const app = await criarAppTeste(free)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoAviso(),
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('plano_somente_leitura')
  })

  it('H1.5: free NÃO cria (pagar invertido) → 422 plano_somente_leitura', async () => {
    const app = await criarAppTeste(free)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoAviso({
        direcao: 'pagar',
        nome_devedor: 'Eu Mesmo',
        telefone_devedor: null,
        nome_cobrador: 'João',
        telefone_cobrador: '+5511988887777',
        // Pix de quem recebe é obrigatório no invertido (H3.1); a guarda de plano vem depois.
        pix_chave: 'joao@pix.com',
      }),
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('plano_somente_leitura')
  })

  it('H1.5: ao subir de plano, a MESMA conta passa a criar (200/201)', async () => {
    await definirPlano(free, 'profissional')
    const app = await criarAppTeste(free)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpoAviso(),
    })
    await app.close()
    expect(r.statusCode).toBe(201)
    // volta ao free para não vazar estado entre arquivos.
    await definirPlano(free, 'free')
    await poolSuper.query(`delete from public.avisos where cobrador_id = $1`, [free])
  })
})
