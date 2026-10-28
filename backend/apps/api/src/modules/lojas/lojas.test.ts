// API-lojas: unidade (contratos, aberta_agora derivado) + integracao contra o banco de teste (role whaviso_api).
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
import { logoPermitido, paraSaida } from './service'
import type * as repo from './repo'
import { AreaEntrega, Cores, LojaCriarEntrada, LojaSaida } from './schemas'

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

describe('paraSaida: aberta_agora derivado da disponibilidade (America/Sao_Paulo)', () => {
  // 2026-03-04 e quarta (dia 3). SP = UTC-3. Clock fixo para a derivacao ser determinista.
  const quartaSp = (hh: number, mm = 0) => new Date(Date.UTC(2026, 2, 4, hh + 3, mm))
  const linha = (): repo.LojaLinha => ({
    id: 'loja-1',
    conta_id: 'conta-1',
    nome: 'Loja',
    logo_url: null,
    cores: {},
    endereco: null,
    area_entrega: null,
    ativo: true,
    pausada: false,
    pausada_motivo: null,
    pausada_ate: null,
    capacidade_por_janela: null,
    capacidade_janela_minutos: 30,
    criado_em: new Date('2026-03-01T00:00:00Z'),
    atualizado_em: new Date('2026-03-01T00:00:00Z'),
    numeros_total: 0,
    numeros_conectados: 0,
  })
  const faixa = (abre: string, fecha: string): repo.FaixaDeLoja => ({ loja_id: 'loja-1', dia_semana: 3, abre, fecha })
  const comFaixa: repo.FaixaDeLoja[] = [faixa('10:00', '14:00')]

  it('aberta dentro da faixa do dia', () => {
    const dispo = { faixas: comFaixa, excecoes: [] }
    expect(paraSaida(linha(), 'dono', dispo, quartaSp(10)).aberta_agora).toBe(true)
    expect(paraSaida(linha(), 'dono', dispo, quartaSp(13, 59)).aberta_agora).toBe(true)
  })
  it('fechada fora da faixa do dia', () => {
    const dispo = { faixas: comFaixa, excecoes: [] }
    expect(paraSaida(linha(), 'dono', dispo, quartaSp(14)).aberta_agora).toBe(false)
    expect(paraSaida(linha(), 'dono', dispo, quartaSp(9, 59)).aberta_agora).toBe(false)
  })
  it('null quando a loja nao tem faixa cadastrada', () => {
    expect(paraSaida(linha(), 'dono', { faixas: [], excecoes: [] }, quartaSp(10)).aberta_agora).toBeNull()
    expect(paraSaida(linha(), 'dono', undefined, quartaSp(10)).aberta_agora).toBeNull()
  })
  it('excecao fechando o dia vence a faixa (fechada, nao null)', () => {
    const dispo = {
      faixas: comFaixa,
      excecoes: [{ loja_id: 'loja-1', data: '2026-03-04', fechado: true, abre: null, fecha: null }],
    }
    expect(paraSaida(linha(), 'dono', dispo, quartaSp(10)).aberta_agora).toBe(false)
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

  it('PATCH atualiza endereco e area; campo ausente permanece', async () => {
    const r = await req(dono, 'PATCH', `/${lojaA}`, {
      endereco: { logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Sao Paulo', uf: 'SP', cep: '01001000' },
      area_entrega: { modo: 'bairros', bairros: ['Centro', 'Vila Nova'] },
    })
    expect(r.statusCode).toBe(200)
    expect(r.json().area_entrega.bairros).toHaveLength(2)
    const n = await req(dono, 'PATCH', `/${lojaA}`, { area_entrega: null })
    expect(n.json().area_entrega).toBeNull()
    expect(n.json().endereco.cidade).toBe('Sao Paulo') // campo ausente permanece
  })

  it('aberta_agora deriva de horarios_funcionamento + excecoes (seed direto); null sem faixa', async () => {
    // Sem faixa cadastrada: null.
    expect((await req(dono, 'GET', `/${lojaA}`)).json().aberta_agora).toBeNull()
    // Faixa cobrindo as 24h da semana toda (duas faixas por dia, sem buraco na virada): aberta.
    for (let d = 0; d < 7; d++) {
      await poolSuper.query(
        `insert into public.horarios_funcionamento (loja_id, dia_semana, abre, fecha)
         values ($1,$2,'00:00','23:00'),($1,$2,'23:00','02:00')`,
        [lojaA, d],
      )
    }
    expect((await req(dono, 'GET', `/${lojaA}`)).json().aberta_agora).toBe(true)
    // Excecao fechando HOJE (data em America/Sao_Paulo) vence a faixa: fechada, nao null.
    await poolSuper.query(
      `insert into public.excecoes_disponibilidade (loja_id, data, fechado)
       values ($1, (now() at time zone 'America/Sao_Paulo')::date, true)`,
      [lojaA],
    )
    expect((await req(dono, 'GET', `/${lojaA}`)).json().aberta_agora).toBe(false)
    // Limpa o seed para nao afetar outros casos.
    await poolSuper.query('delete from public.excecoes_disponibilidade where loja_id = $1', [lojaA])
    await poolSuper.query('delete from public.horarios_funcionamento where loja_id = $1', [lojaA])
    expect((await req(dono, 'GET', `/${lojaA}`)).json().aberta_agora).toBeNull()
  })

  it('SEC-002/081: id, conta_id, chaves extras e jsonb fora do contrato sao barrados', async () => {
    const ataques = [
      { nome: 'X1', conta_id: contaB },
      { nome: 'X2', id: lojaB },
      { nome: 'X3', loja_id: lojaB },
      { nome: 'X4', ativo: false },
      { nome: 'X5', horarios: { fuso: 'America/Sao_Paulo' } }, // coluna/campo legado nao existe mais
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
    expect(nova.aberta_agora).toBeNull() // loja nova nao tem faixa de horario cadastrada
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

  it('G7: pausar/despausar a loja (gestor) reflete no LojaSaida e audita', async () => {
    const semPausa = (await req(dono, 'GET', `/${lojaA}`)).json()
    expect(semPausa.pausada).toBe(false)
    expect(semPausa.capacidade_janela_minutos).toBe(30)

    const p = await req(dono, 'POST', `/${lojaA}/pausar`, { motivo: 'cozinha cheia' }, lojaA)
    expect(p.statusCode, p.body).toBe(200)
    expect(p.json().pausada).toBe(true)
    expect(p.json().pausada_motivo).toBe('cozinha cheia')

    const d2 = await req(dono, 'POST', `/${lojaA}/despausar`, undefined, lojaA)
    expect(d2.statusCode).toBe(200)
    expect(d2.json().pausada).toBe(false)
    expect(d2.json().pausada_motivo).toBeNull()

    // atendente nao pode pausar (403); loja de outra conta = 404 (SEC-001/002)
    expect((await req(atendente, 'POST', `/${lojaA}/pausar`, {}, lojaA)).statusCode).toBe(403)
    expect((await req(dono, 'POST', `/${lojaB}/pausar`, {}, lojaB)).statusCode).toBe(404)

    const tipos = await poolSuper.query(
      `select tipo from public.eventos where entidade_id = $1 and tipo like 'loja.%paus%' order by id`,
      [lojaA],
    )
    expect(tipos.rows.map((t) => t.tipo)).toEqual(['loja.pausada', 'loja.despausada'])
  })

  it('G7: capacidade por janela (gestor); por_janela null remove o limite', async () => {
    const c1 = await req(gerente, 'PATCH', `/${lojaA}/capacidade`, { por_janela: 5, janela_minutos: 15 }, lojaA)
    expect(c1.statusCode, c1.body).toBe(200)
    expect(c1.json().capacidade_por_janela).toBe(5)
    expect(c1.json().capacidade_janela_minutos).toBe(15)

    // janela_minutos ausente preserva o valor atual; so muda o teto
    const c2 = await req(gerente, 'PATCH', `/${lojaA}/capacidade`, { por_janela: null }, lojaA)
    expect(c2.statusCode).toBe(200)
    expect(c2.json().capacidade_por_janela).toBeNull()
    expect(c2.json().capacidade_janela_minutos).toBe(15)

    // validacao de borda: teto zero e negativo recusados (400)
    expect((await req(gerente, 'PATCH', `/${lojaA}/capacidade`, { por_janela: 0 }, lojaA)).statusCode).toBe(400)
    expect((await req(atendente, 'PATCH', `/${lojaA}/capacidade`, { por_janela: 3 }, lojaA)).statusCode).toBe(403)
  })

  it('SEC-030: whaviso_api nao tem DELETE em lojas; whaviso_atendente le mas nao escreve', async () => {
    await expect(poolApi.query('delete from public.lojas where id = $1', [lojaA])).rejects.toThrow(/permission denied|permiss.o negada/)
    const cli = await poolSuper.connect()
    try {
      await cli.query('begin')
      await cli.query('set local role whaviso_atendente')
      const sel = await cli.query('select nome, area_entrega from public.lojas where id = $1', [lojaA])
      expect(sel.rowCount).toBe(1)
      await expect(cli.query(`update public.lojas set nome = 'x' where id = $1`, [lojaA])).rejects.toThrow(/permission denied|permiss.o negada/)
    } finally {
      await cli.query('rollback').catch(() => {})
      cli.release()
    }
  })
})
