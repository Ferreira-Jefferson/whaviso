// Testes do modulo conhecimento: unidade (validador) + integracao contra o Postgres local (role
// whaviso_api). Cobre: criar/editar/versionar/aprovar/arquivar, trava de dado vivo/PII/segredo,
// arquivamento da versao anterior ao aprovar, golden set (docs de outra loja barrados), triagem do
// feedback, multi-tenant, permissao (atendente 403) e evento de aprovacao sem conteudo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  bancoAcessivel, criarConta, criarLoja, criarMembro, criarUsuario, fecharPools, limpar,
  novoCenario, poolApi, poolSuper,
} from '../../../test/db'
import { verificadorFake } from '../../../test/app'
import { construirApp } from '../../app'
import { envSchema } from '../../env'
import { validarDocumento, validarPergunta } from './validador'
import { conhecimentoRoutes } from './routes'

describe('validador de conteudo estavel', () => {
  it('barra preco, tempo, disponibilidade, status, telefone, pix e segredo', () => {
    expect(validarDocumento('A pizza custa R$ 40').motivos).toContain('preco')
    expect(validarDocumento('Aberto hoje').motivos).toContain('temporal')
    expect(validarDocumento('Item esgotado').motivos).toContain('disponibilidade')
    expect(validarDocumento('Seu pedido #123 saiu para entrega').ok).toBe(false)
    expect(validarDocumento('Ligue (11) 98888-7777').motivos).toContain('telefone')
    expect(validarDocumento('Chave Pix da loja').motivos).toContain('pix')
    expect(validarDocumento('api_key = abc').motivos).toContain('segredo')
  })
  it('aceita texto estavel e deixa preco na pergunta do golden set', () => {
    expect(validarDocumento('A massa e fermentada por 48 horas e leva queijo mucarela.').ok).toBe(true)
    expect(validarPergunta('Quanto custa a calabresa?').ok).toBe(true)
    expect(validarPergunta('Meu zap (11) 98888-7777').ok).toBe(false)
  })
})

const online = await bancoAcessivel()

describe.skipIf(!online)('conhecimento (integracao)', () => {
  const cenario = novoCenario()
  let app: Awaited<ReturnType<typeof construirApp>>
  let dono = '', gerente = '', atend = '', donoB = ''
  let lojaA = '', lojaB = ''

  const chamar = (user: string, loja: string, metodo: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
    app.inject({
      method: metodo,
      url: `/v1/conhecimento${url}`,
      headers: { authorization: `Bearer ${user}`, 'x-loja-id': loja },
      ...(payload === undefined ? {} : { payload: payload as object }),
    })

  const novoDoc = async (user = dono, loja = lojaA, extra: object = {}) => {
    const r = await chamar(user, loja, 'POST', '/documentos', {
      tipo: 'faq', titulo: 'Entrega', conteudo: `A loja entrega na regiao central ${"abcdefghij".split("").sort(() => Math.random() - 0.5).join("")}`, ...extra,
    })
    if (r.statusCode !== 201) throw new Error(r.body)
    return r.json() as { id: string; status: string; versao: number }
  }

  beforeAll(async () => {
    dono = await criarUsuario(cenario)
    gerente = await criarUsuario(cenario)
    atend = await criarUsuario(cenario)
    donoB = await criarUsuario(cenario)
    const contaA = await criarConta(cenario, dono)
    const contaB = await criarConta(cenario, donoB)
    lojaA = await criarLoja(contaA)
    lojaB = await criarLoja(contaB)
    await criarMembro(contaA, dono, 'dono', null)
    await criarMembro(contaA, gerente, 'gerente', lojaA)
    await criarMembro(contaA, atend, 'atendente', lojaA)
    await criarMembro(contaB, donoB, 'dono', null)
    const env = envSchema.parse({
      DATABASE_URL: 'postgres://ignorado',
      SUPABASE_URL: 'https://exemplo.supabase.co',
      APP_URL: 'http://localhost:5173',
      RATE_LIMIT_MAX: '100000',
    })
    app = await construirApp({
      env, pool: poolApi, logger: false, verificador: verificadorFake,
      modulos: [{ prefixo: 'conhecimento', plugin: conhecimentoRoutes }],
    })
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    await poolSuper.query('delete from public.eventos where loja_id = any($1)', [[lojaA, lojaB]])
    await limpar(cenario)
    await fecharPools()
  })

  it('cria rascunho, edita no lugar e aprova; gerente tambem pode', async () => {
    const d = await novoDoc()
    expect(d.status).toBe('rascunho')
    const ed = await chamar(gerente, lojaA, 'PATCH', `/documentos/${d.id}`, { titulo: 'Entrega 2' })
    expect(ed.statusCode).toBe(200)
    expect(ed.json()).toMatchObject({ id: d.id, titulo: 'Entrega 2', status: 'rascunho', versao: 1 })
    const ap = await chamar(gerente, lojaA, 'POST', `/documentos/${d.id}/aprovar`)
    expect(ap.statusCode).toBe(200)
    expect(ap.json()).toMatchObject({ status: 'aprovado', chunks_indexados: 0 })
    expect((await chamar(dono, lojaA, 'POST', `/documentos/${d.id}/aprovar`)).statusCode).toBe(409)
    const ev = await poolSuper.query(
      "select detalhes from public.eventos where tipo = 'conhecimento.documento_aprovado' and entidade_id = $1",
      [d.id],
    )
    expect(ev.rowCount).toBe(1)
    expect(JSON.stringify(ev.rows[0].detalhes)).not.toContain('regiao central')
  })

  it('rejeita dado vivo, telefone e segredo na criacao e na edicao (422)', async () => {
    for (const conteudo of ['A pizza custa R$ 40,00', 'Fale no (11) 98888-7777', 'token: abcdef']) {
      const r = await chamar(dono, lojaA, 'POST', '/documentos', { tipo: 'regra', titulo: 'X', conteudo })
      expect(r.statusCode).toBe(422)
      expect(r.json().error.code).toBe('conteudo_nao_estavel')
      expect(r.body).not.toContain('98888')
    }
    const d = await novoDoc()
    const r = await chamar(dono, lojaA, 'PATCH', `/documentos/${d.id}`, { conteudo: 'Hoje temos promocao' })
    expect(r.statusCode).toBe(422)
  })

  it('rascunho com dado vivo plantado direto no banco nao e aprovado', async () => {
    const d = await novoDoc()
    await poolSuper.query("update public.documentos set conteudo = 'sai por R$ 10' where id = $1", [d.id])
    const r = await chamar(dono, lojaA, 'POST', `/documentos/${d.id}/aprovar`)
    expect(r.statusCode).toBe(422)
  })

  it('editar aprovado cria versao nova; aprovar arquiva a anterior; historico preservado', async () => {
    const d = await novoDoc()
    await chamar(dono, lojaA, 'POST', `/documentos/${d.id}/aprovar`)
    const v2 = (await chamar(dono, lojaA, 'PATCH', `/documentos/${d.id}`, { conteudo: 'Entrega ate a zona sul' })).json()
    expect(v2).toMatchObject({ status: 'rascunho', versao: 2, substitui_id: d.id })
    expect((await chamar(dono, lojaA, 'GET', `/documentos/${d.id}`)).json().status).toBe('aprovado')
    // segunda edicao com a v2 ainda pendente
    expect((await chamar(dono, lojaA, 'PATCH', `/documentos/${d.id}`, { titulo: 'Y' })).statusCode).toBe(409)
    await chamar(dono, lojaA, 'POST', `/documentos/${v2.id}/aprovar`)
    expect((await chamar(dono, lojaA, 'GET', `/documentos/${d.id}`)).json().status).toBe('arquivado')
    expect((await chamar(dono, lojaA, 'GET', `/documentos/${v2.id}`)).json().status).toBe('aprovado')
    const h = (await chamar(dono, lojaA, 'GET', `/documentos/${v2.id}/versoes`)).json()
    expect(h.versoes.map((x: { versao: number }) => x.versao)).toEqual([1, 2])
  })

  it('arquivar duas vezes da 409 e arquivado nao edita nem aprova', async () => {
    const d = await novoDoc()
    expect((await chamar(dono, lojaA, 'POST', `/documentos/${d.id}/arquivar`)).json().status).toBe('arquivado')
    expect((await chamar(dono, lojaA, 'POST', `/documentos/${d.id}/arquivar`)).statusCode).toBe(409)
    expect((await chamar(dono, lojaA, 'PATCH', `/documentos/${d.id}`, { titulo: 'Z' })).json().error.code)
      .toBe('documento_arquivado')
    expect((await chamar(dono, lojaA, 'POST', `/documentos/${d.id}/aprovar`)).statusCode).toBe(422)
  })

  it('avisa duplicado por hash de conteudo normalizado', async () => {
    const a = await chamar(dono, lojaA, 'POST', '/documentos', { tipo: 'faq', titulo: 'A', conteudo: 'Aceitamos cartao e dinheiro' })
    const b = await chamar(dono, lojaA, 'POST', '/documentos', { tipo: 'faq', titulo: 'B', conteudo: 'aceitamos  CARTAO e dinheiro' })
    expect(b.json().duplicado_de).toBe(a.json().id)
  })

  it('multi-tenant: loja B nao ve, edita nem aprova documento da loja A', async () => {
    const d = await novoDoc()
    for (const [m, u] of [['GET', ''], ['POST', '/aprovar'], ['POST', '/arquivar']] as const) {
      expect((await chamar(donoB, lojaB, m, `/documentos/${d.id}${u}`)).statusCode).toBe(404)
    }
    expect((await chamar(donoB, lojaB, 'PATCH', `/documentos/${d.id}`, { titulo: 'x' })).statusCode).toBe(404)
    const lista = (await chamar(donoB, lojaB, 'GET', '/documentos')).json()
    expect(lista.itens.find((x: { id: string }) => x.id === d.id)).toBeUndefined()
    // x-loja-id de outra conta e rejeitado
    expect((await chamar(donoB, lojaA, 'GET', '/documentos')).statusCode).toBeGreaterThanOrEqual(403)
  })

  it('atendente nunca chega a API; sem token e 401', async () => {
    for (const [m, u] of [['GET', '/documentos'], ['GET', '/avaliacao'], ['GET', '/feedback']] as const) {
      expect((await chamar(atend, lojaA, m, u)).statusCode).toBe(403)
    }
    expect((await chamar(atend, lojaA, 'POST', '/documentos', { tipo: 'faq', titulo: 'a', conteudo: 'b' })).statusCode).toBe(403)
    const r = await app.inject({ method: 'GET', url: '/v1/conhecimento/documentos', headers: { 'x-loja-id': lojaA } })
    expect(r.statusCode).toBe(401)
  })

  it('validacao de borda: campo desconhecido e loja_id no corpo dao 400', async () => {
    const r = await chamar(dono, lojaA, 'POST', '/documentos', { tipo: 'faq', titulo: 'a', conteudo: 'b', loja_id: lojaB })
    expect(r.statusCode).toBe(400)
    expect((await chamar(dono, lojaA, 'POST', '/documentos', { tipo: 'cardapio', titulo: 'a', conteudo: 'b' })).statusCode).toBe(400)
  })

  it('golden set: cria, valida docs da loja, edita e desativa; doc de outra loja e 422', async () => {
    const d = await novoDoc()
    const ok = await chamar(dono, lojaA, 'POST', '/avaliacao', {
      pergunta: 'Voces entregam no centro?', docs_esperados: [d.id], tipo: 'faq',
    })
    expect(ok.statusCode).toBe(201)
    expect(ok.json()).toMatchObject({ docs_esperados: [d.id], ativo: true, origem: 'semente' })
    const outra = await novoDoc(donoB, lojaB)
    const ruim = await chamar(dono, lojaA, 'POST', '/avaliacao', { pergunta: 'Pergunta qualquer', docs_esperados: [outra.id] })
    expect(ruim.statusCode).toBe(422)
    expect(ruim.json().error.code).toBe('documento_invalido')
    const up = await chamar(dono, lojaA, 'PATCH', `/avaliacao/${ok.json().id}`, { ativo: false })
    expect(up.json().ativo).toBe(false)
    const inativos = (await chamar(dono, lojaA, 'GET', '/avaliacao?ativo=false')).json()
    expect(inativos.itens.map((x: { id: string }) => x.id)).toContain(ok.json().id)
    expect((await chamar(donoB, lojaB, 'PATCH', `/avaliacao/${ok.json().id}`, { ativo: true })).statusCode).toBe(404)
    const pii = await chamar(dono, lojaA, 'POST', '/avaliacao', { pergunta: 'Meu numero (11) 98888-7777' })
    expect(pii.statusCode).toBe(422)
  })

  it('feedback: novo -> triado -> promovido gera rascunho realimentado; atalhos invalidos dao 422', async () => {
    const fb = await poolSuper.query(
      "insert into public.rag_feedback (loja_id, tipo, texto, ocorrencias) values ($1, 'lacuna', 'cliente perguntou sobre embalagem', 3) returning id",
      [lojaA],
    )
    const id = fb.rows[0].id as string
    const lista = (await chamar(dono, lojaA, 'GET', '/feedback?status=novo')).json()
    expect(lista.itens.map((x: { id: string }) => x.id)).toContain(id)
    expect((await chamar(donoB, lojaB, 'GET', '/feedback')).json().itens).toHaveLength(0)
    const corpo = { tipo: 'regra', titulo: 'Embalagem', conteudo: 'Usamos embalagem reciclavel.' }
    expect((await chamar(dono, lojaA, 'POST', `/feedback/${id}/promover`, corpo)).json().error.code).toBe('feedback_nao_triado')
    expect((await chamar(dono, lojaA, 'POST', `/feedback/${id}/triar`)).json().status).toBe('triado')
    expect((await chamar(dono, lojaA, 'POST', `/feedback/${id}/triar`)).statusCode).toBe(422)
    expect((await chamar(donoB, lojaB, 'POST', `/feedback/${id}/triar`)).statusCode).toBe(404)
    const vivo = await chamar(dono, lojaA, 'POST', `/feedback/${id}/promover`, { ...corpo, conteudo: 'Custa R$ 2' })
    expect(vivo.statusCode).toBe(422)
    const pr = await chamar(dono, lojaA, 'POST', `/feedback/${id}/promover`, corpo)
    expect(pr.statusCode).toBe(200)
    expect(pr.json().feedback).toMatchObject({ status: 'promovido', documento_rascunho_id: pr.json().documento.id })
    expect(pr.json().documento).toMatchObject({ status: 'rascunho', origem: 'realimentado' })
    expect((await chamar(dono, lojaA, 'POST', `/feedback/${id}/descartar`)).statusCode).toBe(422)
  })

  it('descarta feedback novo; aprovar rascunho ligado a feedback promove o feedback', async () => {
    const f1 = (await poolSuper.query(
      "insert into public.rag_feedback (loja_id, tipo, texto) values ($1, 'recorrente', 'x') returning id", [lojaA])).rows[0].id
    expect((await chamar(dono, lojaA, 'POST', `/feedback/${f1}/descartar`)).json().status).toBe('descartado')
    const d = await novoDoc()
    const f2 = (await poolSuper.query(
      "insert into public.rag_feedback (loja_id, tipo, texto, documento_rascunho_id) values ($1, 'correcao_humana', 'y', $2) returning id",
      [lojaA, d.id])).rows[0].id
    await chamar(dono, lojaA, 'POST', `/documentos/${d.id}/aprovar`)
    const s = await poolSuper.query('select status from public.rag_feedback where id = $1', [f2])
    expect(s.rows[0].status).toBe('promovido')
  })
})
