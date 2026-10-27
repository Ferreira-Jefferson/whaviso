// API-lojas: unidade (contratos, horarios) + integracao contra o banco de teste (role whaviso_api).
// SEC-001/002 (isolamento, corpo nao manda), SEC-030 (sem DELETE), SEC-081 (jsonb estrito).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import {
  bancoAcessivel,
  fecharPools,
  poolApi,
  poolSuper,
  novoCenario,
  criarUsuario,
  criarConta,
  criarLoja,
  criarMembro,
  limpar,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { criarLojasRoutes } from './routes'
import { lojaAbertaAgora } from './horarios'
import { logoPermitido, horariosVazios } from './service'
import { AreaEntrega, Cores, Horarios, LojaCriarEntrada, LojaSaida } from './schemas'

const dia = (d: number, faixas: { abre: string; fecha: string }[] = []) => ({
  dia: d,
  fechado: faixas.length === 0,
  faixas,
})
const semana = (f: (d: number) => { abre: string; fecha: string }[]) => ({
  fuso: 'America/Sao_Paulo' as const,
  dias: Array.from({ length: 7 }, (_, d) => dia(d, f(d))),
})

describe('contratos de loja', () => {
  it('cor invalida, raio negativo/zero/enorme', () => {
    expect(Cores.safeParse({ primaria: '#12ab9F' }).success).toBe(true)
    expect(Cores.safeParse({ primaria: 'vermelho' }).success).toBe(false)
    expect(Cores.safeParse({ primaria: '#fff' }).success).toBe(false)
    expect(Cores.safeParse({ primaria: '#112233', x: '#112233' }).success).toBe(false)
    const centro = { lat: -23.5, lng: -46.6 }
    expect(AreaEntrega.safeParse({ modo: 'raio', raio_km: 5, centro }).success).toBe(true)
    expect(AreaEntrega.safeParse({ modo: 'raio', raio_km: -1, centro }).success).toBe(false)
    expect(AreaEntrega.safeParse({ modo: 'raio', raio_km: 0, centro }).success).toBe(false)
    expect(AreaEntrega.safeParse({ modo: 'raio', raio_km: 500, centro }).success).toBe(false)
    expect(AreaEntrega.safeParse({ modo: 'bairros', bairros: ['A', 'a'] }).success).toBe(false)
  })

  it('horarios: faixa cruzando meia-noite vale; sobreposicao, igual e dia fechado com faixa nao', () => {
    expect(Horarios.safeParse(semana(() => [{ abre: '18:00', fecha: '02:00' }])).success).toBe(true)
    // a virada de terca (ate 02:00 de quarta) invade a faixa de quarta que abre 01:00
    expect(
      Horarios.safeParse(
        semana((d) => (d === 2 ? [{ abre: '18:00', fecha: '02:00' }] : d === 3 ? [{ abre: '01:00', fecha: '03:00' }] : [])),
      ).success,
    ).toBe(false)
    expect(
      Horarios.safeParse(semana((d) => (d === 2 ? [{ abre: '18:00', fecha: '02:00' }] : []))).success,
    ).toBe(true)
    expect(Horarios.safeParse(semana(() => [{ abre: '10:00', fecha: '14:00' }, { abre: '13:00', fecha: '18:00' }])).success).toBe(false)
    expect(Horarios.safeParse(semana(() => [{ abre: '10:00', fecha: '10:00' }])).success).toBe(false)
    expect(Horarios.safeParse(semana(() => [{ abre: '25:00', fecha: '10:00' }])).success).toBe(false)
    const h = horariosVazios()
    h.dias[0] = { dia: 0, fechado: true, faixas: [{ abre: '10:00', fecha: '12:00' }] }
    expect(Horarios.safeParse(h).success).toBe(false)
    expect(Horarios.safeParse({ ...horariosVazios(), fuso: 'UTC' }).success).toBe(false)
  })

  it('criar nega chaves fora do contrato (conta_id, id)', () => {
    expect(LojaCriarEntrada.safeParse({ nome: 'Loja' }).success).toBe(true)
    expect(LojaCriarEntrada.safeParse({ nome: 'Loja', conta_id: randomUUID() }).success).toBe(false)
  })

  it('logo: so host allowlisted (e subdominio), nunca sufixo enganoso', () => {
    const hosts = ['cdn.exemplo.com']
    expect(logoPermitido('https://cdn.exemplo.com/a.png', hosts)).toBe(true)
    expect(logoPermitido('https://x.cdn.exemplo.com/a.png', hosts)).toBe(true)
    expect(logoPermitido('https://evilcdn.exemplo.com.atacante.io/a.png', hosts)).toBe(false)
    expect(logoPermitido('https://atacante.io/cdn.exemplo.com', hosts)).toBe(false)
    expect(logoPermitido('nao-e-url', hosts)).toBe(false)
  })
})

describe('lojaAbertaAgora (America/Sao_Paulo)', () => {
  // 2026-03-04 e quarta (dia 3). SP = UTC-3.
  const quartaSp = (hh: number, mm = 0) => new Date(Date.UTC(2026, 2, 4, hh + 3, mm))
  const h = semana((d) => (d === 3 ? [{ abre: '10:00', fecha: '14:00' }, { abre: '18:00', fecha: '02:00' }] : []))

  it('dentro, fora e limites da faixa', () => {
    expect(lojaAbertaAgora(h, quartaSp(10))).toBe(true)
    expect(lojaAbertaAgora(h, quartaSp(13, 59))).toBe(true)
    expect(lojaAbertaAgora(h, quartaSp(14))).toBe(false)
    expect(lojaAbertaAgora(h, quartaSp(9, 59))).toBe(false)
  })
  it('faixa que cruza meia-noite abre o dia seguinte; dia fechado e false', () => {
    expect(lojaAbertaAgora(h, quartaSp(23))).toBe(true)
    expect(lojaAbertaAgora(h, new Date(Date.UTC(2026, 2, 5, 4, 30)))).toBe(true) // quinta 01:30 SP
    expect(lojaAbertaAgora(h, new Date(Date.UTC(2026, 2, 5, 5, 0)))).toBe(false) // quinta 02:00 SP
    expect(lojaAbertaAgora(h, new Date(Date.UTC(2026, 2, 5, 15, 0)))).toBe(false) // quinta 12:00 SP
  })
  it('usa o fuso nomeado: 23:30 UTC de quarta ainda e quarta 20:30 em SP', () => {
    expect(lojaAbertaAgora(h, new Date(Date.UTC(2026, 2, 4, 23, 30)))).toBe(true)
    expect(lojaAbertaAgora(null)).toBeNull()
  })
})

const online = await bancoAcessivel()
const d = online ? describe : describe.skip
if (!online) console.warn('[lojas] banco de teste inacessivel: integracao PULADA.')

const env = envSchema.parse({
  DATABASE_URL: 'postgres://ignorado',
  SUPABASE_URL: 'https://projeto.supabase.co',
  APP_URL: 'http://localhost:5173',
  RATE_LIMIT_DESLIGADO: 'true',
})

d('lojas (integracao)', () => {
  const c = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let dono: string, gerente: string, atendente: string, donoB: string, semConta: string
  let contaA: string, contaB: string, lojaA: string, lojaB: string

  const req = (usuario: string, method: string, url: string, payload?: unknown, loja?: string) =>
    app.inject({
      method: method as 'GET',
      url: `/v1/lojas${url}`,
      headers: { authorization: `Bearer ${usuario}`, ...(loja ? { 'x-loja-id': loja } : {}) },
      ...(payload === undefined ? {} : { payload: payload as object }),
    })

  beforeAll(async () => {
    dono = await criarUsuario(c)
    gerente = await criarUsuario(c)
    atendente = await criarUsuario(c)
    donoB = await criarUsuario(c)
    semConta = await criarUsuario(c)
    contaA = await criarConta(c, dono)
    contaB = await criarConta(c, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, dono, 'dono', null)
    await criarMembro(contaA, gerente, 'gerente', lojaA)
    await criarMembro(contaA, atendente, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    app = await construirApp({
      env,
      pool: poolApi,
      logger: false,
      verificador: verificadorFake,
      modulos: [
        { prefixo: 'lojas', plugin: criarLojasRoutes({ hostsLogoExtras: ['cdn.exemplo.com'] }) },
      ],
    })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await poolSuper.query(
      'delete from public.eventos where loja_id in (select id from public.lojas where conta_id = any($1))',
      [c.contas],
    )
    await limpar(c)
    await fecharPools()
  })

  it('GET /lojas devolve so as lojas do escopo e no formato LojaSaida (SEC-001)', async () => {
    const r = await req(dono, 'GET', '')
    expect(r.statusCode).toBe(200)
    const itens = r.json().itens as { id: string }[]
    expect(itens.map((i) => i.id)).toEqual([lojaA])
    for (const i of itens) expect(LojaSaida.safeParse(i).success).toBe(true)
    expect(JSON.stringify(r.json())).not.toContain(contaA) // conta_id e interno
    const rb = await req(donoB, 'GET', '')
    expect(rb.json().itens.map((i: { id: string }) => i.id)).toEqual([lojaB])
  })

  it('SEC-001: loja de outra conta devolve 404 (leitura, edicao, branding, x-loja-id)', async () => {
    for (const [m, u, p] of [
      ['GET', `/${lojaB}`, undefined],
      ['PATCH', `/${lojaB}`, { nome: 'Invadida' }],
      ['PATCH', `/${lojaB}/branding`, { cores: { primaria: '#000000' } }],
    ] as const) {
      const r = await req(dono, m, u, p)
      expect(r.statusCode).toBe(404)
      expect(r.json().error.code).toBe('nao_encontrado')
    }
    expect((await req(dono, 'GET', '', undefined, lojaB)).statusCode).toBe(404)
    expect((await req(dono, 'POST', `/${lojaB}/desativar`)).statusCode).toBe(404)
    const { rows } = await poolSuper.query('select nome from public.lojas where id = $1', [lojaB])
    expect(rows[0].nome).toBe('Loja de teste')
  })

  it('matriz de papeis: atendente le e nao edita; gerente edita e nao cria/desativa', async () => {
    expect((await req(atendente, 'GET', `/${lojaA}`)).statusCode).toBe(200)
    expect((await req(atendente, 'PATCH', `/${lojaA}`, { nome: 'Nova' })).statusCode).toBe(403)
    expect((await req(atendente, 'PATCH', `/${lojaA}/branding`, { cores: {} })).statusCode).toBe(403)
    const g = await req(gerente, 'PATCH', `/${lojaA}`, { nome: 'Pizzaria do Gerente' })
    expect(g.statusCode).toBe(200)
    expect(g.json().nome).toBe('Pizzaria do Gerente')
    expect(g.json().papel).toBe('gerente')
    expect((await req(gerente, 'POST', '', { nome: 'Outra' })).statusCode).toBe(403)
    expect((await req(gerente, 'POST', `/${lojaA}/desativar`)).statusCode).toBe(403)
    expect((await req(gerente, 'POST', `/${lojaA}/reativar`)).statusCode).toBe(403)
    expect((await req(semConta, 'GET', '')).statusCode).toBe(403)
    const sem = await app.inject({ method: 'GET', url: '/v1/lojas' })
    expect(sem.statusCode).toBe(401)
  })

  it('PATCH atualiza horarios, endereco e area; aberta_agora vem do servidor', async () => {
    const sempre = semana(() => [{ abre: '00:00', fecha: '23:59' }])
    const r = await req(dono, 'PATCH', `/${lojaA}`, {
      horarios: sempre,
      endereco: { logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Sao Paulo', uf: 'SP', cep: '01001000' },
      area_entrega: { modo: 'bairros', bairros: ['Centro', 'Vila Nova'] },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().aberta_agora).toBe(true)
    expect(r.json().area_entrega.bairros).toHaveLength(2)
    const f = await req(dono, 'PATCH', `/${lojaA}`, { horarios: horariosVazios() })
    expect(f.json().aberta_agora).toBe(false)
    const n = await req(dono, 'PATCH', `/${lojaA}`, { horarios: null, area_entrega: null })
    expect(n.json().horarios).toBeNull()
    expect(n.json().aberta_agora).toBeNull()
    expect(n.json().endereco.cidade).toBe('Sao Paulo') // campo ausente permanece
  })

  it('SEC-002/081: id, conta_id, chaves extras e jsonb fora do contrato sao barrados', async () => {
    const ataques = [
      { nome: 'X1', conta_id: contaB },
      { nome: 'X2', id: lojaB },
      { nome: 'X3', loja_id: lojaB },
      { nome: 'X4', ativo: false },
      { horarios: { ...horariosVazios(), extra: 1 } },
      { horarios: semana(() => [{ abre: '10:00', fecha: '14:00' }, { abre: '13:00', fecha: '15:00' }]) },
      { area_entrega: { modo: 'raio', raio_km: -2, centro: { lat: 0, lng: 0 } } },
      {},
    ]
    for (const a of ataques) {
      const r = await req(dono, 'PATCH', `/${lojaA}`, a)
      expect(r.statusCode).toBe(400)
      expect(r.json().error.code).toBe('entrada_invalida')
    }
    const { rows } = await poolSuper.query('select nome, ativo, conta_id from public.lojas where id = $1', [lojaA])
    expect(rows[0].nome).toBe('Pizzaria do Gerente')
    expect(rows[0].ativo).toBe(true)
    expect(rows[0].conta_id).toBe(contaA)
  })

  it('branding: cores, logo https de host permitido; resto barrado', async () => {
    const ok = await req(dono, 'PATCH', `/${lojaA}/branding`, {
      cores: { primaria: '#FF0000', fundo: '#ffffff' },
      logo_url: 'https://cdn.exemplo.com/logo.png',
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().cores.primaria).toBe('#FF0000')
    expect(ok.json().logo_url).toBe('https://cdn.exemplo.com/logo.png')
    const supa = await req(dono, 'PATCH', `/${lojaA}/branding`, { logo_url: 'https://projeto.supabase.co/storage/l.png' })
    expect(supa.statusCode).toBe(200)
    expect((await req(dono, 'PATCH', `/${lojaA}/branding`, { cores: { primaria: 'azul' } })).statusCode).toBe(400)
    expect((await req(dono, 'PATCH', `/${lojaA}/branding`, { cores: { script: '#000000' } })).statusCode).toBe(400)
    expect((await req(dono, 'PATCH', `/${lojaA}/branding`, { logo_url: 'http://cdn.exemplo.com/l.png' })).statusCode).toBe(400)
    expect((await req(dono, 'PATCH', `/${lojaA}/branding`, { logo_url: 'javascript:alert(1)' })).statusCode).toBe(400)
    const host = await req(dono, 'PATCH', `/${lojaA}/branding`, { logo_url: 'https://atacante.io/l.png' })
    expect(host.statusCode).toBe(422)
    expect(host.json().error.code).toBe('logo_host_nao_permitido')
    const limpo = await req(dono, 'PATCH', `/${lojaA}/branding`, { logo_url: null })
    expect(limpo.json().logo_url).toBeNull()
  })

  it('resumo de numeros WhatsApp: so contagem, sem credencial', async () => {
    await poolSuper.query(
      `insert into public.numeros_whatsapp (loja_id, phone_number_id, waba_id, status, token_cifrado)
       values ($1, $2, 'waba', 'conectado', '\\x0102'), ($1, $3, 'waba', 'removido', null)`,
      [lojaA, `pn-${randomUUID()}`, `pn-${randomUUID()}`],
    )
    const r = await req(atendente, 'GET', `/${lojaA}`)
    expect(r.json().numeros_whatsapp).toEqual({ total: 1, conectados: 1 })
    expect(r.body).not.toMatch(/token|phone_number_id|waba/)
  })

  it('POST /lojas: so dono; conta vem do vinculo; defaults validos; auditoria sem PII', async () => {
    const r = await req(dono, 'POST', '', { nome: '  Filial Centro  ' })
    expect(r.statusCode).toBe(201)
    const nova = r.json()
    expect(nova.nome).toBe('Filial Centro')
    expect(nova.ativo).toBe(true)
    expect(nova.papel).toBe('dono')
    expect(Horarios.safeParse(nova.horarios).success).toBe(true)
    expect(nova.aberta_agora).toBe(false)
    const { rows } = await poolSuper.query('select conta_id from public.lojas where id = $1', [nova.id])
    expect(rows[0].conta_id).toBe(contaA)
    const ev = await poolSuper.query('select tipo, ator, detalhes from public.eventos where entidade_id = $1', [nova.id])
    expect(ev.rows[0]).toMatchObject({ tipo: 'loja.criada', ator: 'loja' })
    expect(JSON.stringify(ev.rows[0].detalhes)).not.toContain('Filial')
    // SEC-002: conta_id no corpo e barrado e nao cria loja em outra conta
    const mal = await req(dono, 'POST', '', { nome: 'Fraude', conta_id: contaB })
    expect(mal.statusCode).toBe(400)
    expect((await req(semConta, 'POST', '', { nome: 'Sem conta' })).statusCode).toBe(403)
    const lista = await req(dono, 'GET', '')
    expect(lista.json().itens).toHaveLength(2)
  })

  it('desativar/reativar: so dono, preserva dados, bloqueia a unica loja ativa', async () => {
    // donoB tem uma unica loja ativa
    const unica = await req(donoB, 'POST', `/${lojaB}/desativar`)
    expect(unica.statusCode).toBe(422)
    expect(unica.json().error.code).toBe('ultima_loja_ativa')

    const lista = (await req(dono, 'GET', '')).json().itens as { id: string }[]
    const filial = lista.find((l) => l.id !== lojaA)!.id
    const des = await req(dono, 'POST', `/${filial}/desativar`)
    expect(des.statusCode).toBe(200)
    expect(des.json().ativo).toBe(false)
    expect((await req(dono, 'POST', `/${filial}/desativar`)).json().error.code).toBe('loja_ja_inativa')

    expect((await req(dono, 'GET', '')).json().itens).toHaveLength(1)
    const comInativas = await req(dono, 'GET', '?incluir_inativas=true')
    expect(comInativas.json().itens).toHaveLength(2)
    expect((await req(gerente, 'GET', '?incluir_inativas=true')).json().itens).toHaveLength(1)
    expect((await req(dono, 'GET', `/${filial}`)).statusCode).toBe(404) // fora do escopo enquanto inativa
    const { rows } = await poolSuper.query('select count(*)::int n from public.lojas where id = $1', [filial])
    expect(rows[0].n).toBe(1) // nunca apaga

    const rea = await req(dono, 'POST', `/${filial}/reativar`)
    expect(rea.statusCode).toBe(200)
    expect(rea.json().ativo).toBe(true)
    expect((await req(dono, 'POST', `/${filial}/reativar`)).json().error.code).toBe('loja_ja_ativa')
    expect((await req(dono, 'POST', `/${lojaB}/reativar`)).statusCode).toBe(404)
    expect((await req(donoB, 'POST', `/${filial}/desativar`)).statusCode).toBe(404)
    expect((await req(dono, 'GET', '')).json().itens).toHaveLength(2)

    const tipos = await poolSuper.query(
      'select tipo from public.eventos where entidade_id = $1 order by id',
      [filial],
    )
    expect(tipos.rows.map((t) => t.tipo)).toEqual(['loja.criada', 'loja.desativada', 'loja.reativada'])
  })

  it('id malformado e 400 e nao chega ao banco', async () => {
    expect((await req(dono, 'GET', '/nao-e-uuid')).statusCode).toBe(400)
  })

  it('SEC-030: whaviso_api nao tem DELETE em lojas; whaviso_atendente le mas nao escreve', async () => {
    await expect(poolApi.query('delete from public.lojas where id = $1', [lojaA])).rejects.toThrow(/permission denied|permiss.o negada/)
    const cli = await poolSuper.connect()
    try {
      await cli.query('begin')
      await cli.query('set local role whaviso_atendente')
      const sel = await cli.query('select horarios, area_entrega from public.lojas where id = $1', [lojaA])
      expect(sel.rowCount).toBe(1)
      await expect(cli.query(`update public.lojas set nome = 'x' where id = $1`, [lojaA])).rejects.toThrow(/permission denied|permiss.o negada/)
    } finally {
      await cli.query('rollback').catch(() => {})
      cli.release()
    }
  })
})
