// Fase A: métricas de negócio (papel cobrador). Cobre lucro (só com custo informado),
// ticket médio, melhores clientes (por telefone), quebra por categoria e inativos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarAppTeste, criarUsuario, encerrarPools, limparUsuario, poolSuper } from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }
const A = '+5511900000201'
const B = '+5511900000202'
const C = '+5511900000203'

afterAll(async () => {
  await encerrarPools()
})

interface Ins {
  nome: string
  tel: string
  status: string
  valor: number
  custo: number | null
  cat: string | null
  data: string
}

async function ins(uid: string, r: Ins): Promise<void> {
  // E16 multi: categoria vive na junção aviso_categorias, não em avisos.categoria_id.
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
        pix_chave, motivo, valor_centavos, data_combinada, valor_custo_centavos)
     values ($1,'receber','cobrador',$2,$3,$4,'c@pix.com','pedido',$5,$6,$7)
     returning id`,
    [uid, r.status, r.nome, r.tel, r.valor, r.data, r.custo],
  )
  if (r.cat) {
    await poolSuper.query(
      `insert into public.aviso_categorias (aviso_id, categoria_id) values ($1,$2)`,
      [rows[0]!.id, r.cat],
    )
  }
}

describe('painel: métricas de negócio (integração)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Revendedora')
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.categorias (profile_id, nome) values ($1,'Natura') returning id`,
      [uid],
    )
    const natura = rows[0]!.id
    // A: dois pagos (um com custo, um sem), categoria Natura, recente.
    await ins(uid, { nome: 'Ana', tel: A, status: 'pago', valor: 10000, custo: 6000, cat: natura, data: '2026-07-01' })
    await ins(uid, { nome: 'Ana', tel: A, status: 'pago', valor: 5000, custo: null, cat: natura, data: '2026-07-02' })
    // B: um ativo (programado), sem categoria, recente -> não é inativo (tem ativo).
    await ins(uid, { nome: 'Bia', tel: B, status: 'programado', valor: 3000, custo: null, cat: null, data: '2026-07-05' })
    // C: um pago antigo, sem categoria, com custo -> inativo (sem ativo e data antiga).
    await ins(uid, { nome: 'Cida', tel: C, status: 'pago', valor: 2000, custo: 1000, cat: null, data: '2020-01-01' })
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('agrega recebido/a receber, lucro só com custo, ticket médio', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: '/v1/painel/metricas', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.recebido_centavos).toBe(17000) // 10000 + 5000 + 2000
    expect(b.recebido_qtd).toBe(3)
    expect(b.a_receber_centavos).toBe(3000)
    expect(b.custo_pago_centavos).toBe(7000) // 6000 + 1000
    expect(b.lucro_centavos).toBe(5000) // (10000-6000) + (2000-1000)
    expect(b.lucro_base_qtd).toBe(2) // só os pagos com custo informado
    expect(b.ticket_medio_centavos).toBe(5667) // round(17000/3)
  })

  it('melhores clientes por telefone, por categoria e inativos', async () => {
    const app = await criarAppTeste(uid)
    const b = (await app.inject({ method: 'GET', url: '/v1/painel/metricas', headers: AUTH })).json()
    await app.close()

    // Melhores: A junta os dois pagos (15000), depois C (2000); B (sem pago) fora.
    expect(b.melhores_clientes[0]).toMatchObject({ telefone: A, recebido_centavos: 15000, qtd: 2 })
    expect(b.melhores_clientes[1]).toMatchObject({ telefone: C, recebido_centavos: 2000, qtd: 1 })
    expect(b.melhores_clientes.some((m: { telefone: string }) => m.telefone === B)).toBe(false)

    // Por categoria: Natura (recebido 15000, lucro só do que tem custo = 4000) e sem categoria.
    const natura = b.por_categoria.find((c: { nome: string | null }) => c.nome === 'Natura')
    const sem = b.por_categoria.find((c: { categoria_id: string | null }) => c.categoria_id === null)
    expect(natura).toMatchObject({ recebido_centavos: 15000, lucro_centavos: 4000, qtd: 2 })
    expect(sem).toMatchObject({ recebido_centavos: 2000, a_receber_centavos: 3000, lucro_centavos: 1000 })

    // Inativos: só C (pago antigo, sem ativo). A é recente; B tem ativo.
    expect(b.inativos).toHaveLength(1)
    expect(b.inativos[0]).toMatchObject({ telefone: C, nome: 'Cida' })
    expect(b.inativos[0].dias).toBeGreaterThan(60)
  })
})

// E18 H18.3: com multi-categoria, a quebra por categoria usa ATRIBUIÇÃO INTEGRAL. Um
// combinado em 2 categorias soma o valor CHEIO em cada uma (buckets se sobrepõem), enquanto
// o total geral (lido de avisos sem join) NÃO infla.
describe('painel: métricas por categoria com atribuição integral (multi)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Revendedora multi')
    const cat = async (nome: string) =>
      (await poolSuper.query<{ id: string }>(
        `insert into public.categorias (profile_id, nome) values ($1,$2) returning id`,
        [uid, nome],
      )).rows[0]!.id
    const natura = await cat('Natura')
    const presentes = await cat('Presentes')
    // Um único pago de 10000 em DUAS categorias.
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.avisos
         (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
          pix_chave, motivo, valor_centavos, data_combinada)
       values ($1,'receber','cobrador','pago','Ana','+5511900000301','c@pix.com','pedido',10000,'2026-07-01')
       returning id`,
      [uid],
    )
    await poolSuper.query(
      `insert into public.aviso_categorias (aviso_id, categoria_id) values ($1,$2),($1,$3)`,
      [rows[0]!.id, natura, presentes],
    )
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('cada categoria recebe o valor cheio; a soma dos buckets excede o total geral', async () => {
    const app = await criarAppTeste(uid)
    const b = (await app.inject({ method: 'GET', url: '/v1/painel/metricas', headers: AUTH })).json()
    await app.close()

    // Total geral: um único combinado de 10000 (lido sem join, não infla).
    expect(b.recebido_centavos).toBe(10000)
    expect(b.recebido_qtd).toBe(1)

    // Cada categoria soma o valor CHEIO (atribuição integral).
    const natura = b.por_categoria.find((c: { nome: string | null }) => c.nome === 'Natura')
    const presentes = b.por_categoria.find((c: { nome: string | null }) => c.nome === 'Presentes')
    expect(natura).toMatchObject({ recebido_centavos: 10000, qtd: 1 })
    expect(presentes).toMatchObject({ recebido_centavos: 10000, qtd: 1 })

    // Soma dos buckets (20000) > total geral (10000): buckets se sobrepõem, não somam ao total.
    const somaBuckets = b.por_categoria.reduce(
      (s: number, c: { recebido_centavos: number }) => s + c.recebido_centavos,
      0,
    )
    expect(somaBuckets).toBe(20000)
    expect(somaBuckets).toBeGreaterThan(b.recebido_centavos)
  })
})

// E18 H18.2 (item 17): indicadores extra da aba Resultados. SÓ TOTAL nesta leva (não por
// cliente, decisão registrada no plano de implementação).
describe('painel: métricas - engajamento e conclusão (item 17)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Revendedora engajamento')
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('agrega solicitou_pix, mensagens lidas, taxa de conclusão e tempo médio até confirmação', async () => {
    // Combinado PAGO: 1 clique em "ver chave Pix", "já paguei" -> confirmado 2 dias depois,
    // e 2 envios (1 lido, 1 só entregue).
    const pago = await poolSuper.query<{ id: string }>(
      `insert into public.avisos
         (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
          pix_chave, motivo, valor_centavos, data_combinada)
       values ($1,'receber','cobrador','pago','Ana','+5511900000501','c@pix.com','pedido',10000,'2026-07-01')
       returning id`,
      [uid],
    )
    const avisoId = pago.rows[0]!.id
    await poolSuper.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'solicitou_pix','devedor')`,
      [avisoId],
    )
    await poolSuper.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator, criado_em)
       values ($1,'ja_paguei_devedor','devedor','2026-07-03 10:00:00+00')`,
      [avisoId],
    )
    await poolSuper.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator, criado_em)
       values ($1,'confirmado_cobrador','cobrador','2026-07-05 10:00:00+00')`,
      [avisoId],
    )
    await poolSuper.query(
      `insert into public.envios (aviso_id, etapa, status, agendado_para, entrega_status)
       values ($1,'d','enviado', now(), 'read')`,
      [avisoId],
    )
    await poolSuper.query(
      `insert into public.envios (aviso_id, etapa, status, agendado_para, entrega_status)
       values ($1,'d_mais_1','enviado', now(), 'delivered')`,
      [avisoId],
    )

    // Combinado CANCELADO: compõe a taxa de conclusão (1 pago de 2 terminais = 50%).
    await poolSuper.query(
      `insert into public.avisos
         (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
          pix_chave, motivo, valor_centavos, data_combinada)
       values ($1,'receber','cobrador','cancelado','Bia','+5511900000502','c@pix.com','pedido',5000,'2026-07-02')`,
      [uid],
    )

    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'GET', url: '/v1/painel/metricas', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    const b = r.json()

    expect(b.solicitou_pix_qtd).toBe(1)
    expect(b.mensagens_lidas_qtd).toBe(1)
    expect(b.mensagens_com_status_qtd).toBe(2)
    expect(b.taxa_combinados_concluidos).toBeCloseTo(0.5)
    expect(b.tempo_medio_confirmacao_dias).toBeCloseTo(2, 0)
  })

  it('sem eventos/confirmações, os indicadores voltam zerados/nulos (nunca quebram)', async () => {
    const outro = await criarUsuario('Revendedora sem histórico')
    const app = await criarAppTeste(outro)
    const r = await app.inject({ method: 'GET', url: '/v1/painel/metricas', headers: AUTH })
    await app.close()
    await limparUsuario(outro)
    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.solicitou_pix_qtd).toBe(0)
    expect(b.mensagens_lidas_qtd).toBe(0)
    expect(b.mensagens_com_status_qtd).toBe(0)
    expect(b.taxa_combinados_concluidos).toBeNull()
    expect(b.tempo_medio_confirmacao_dias).toBeNull()
  })
})
