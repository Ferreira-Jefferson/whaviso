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
  await poolSuper.query(
    `insert into public.avisos
       (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
        pix_chave, motivo, valor_centavos, data_combinada, categoria_id, valor_custo_centavos)
     values ($1,'receber','cobrador',$2,$3,$4,'c@pix.com','pedido',$5,$6,$7,$8)`,
    [uid, r.status, r.nome, r.tel, r.valor, r.data, r.cat, r.custo],
  )
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
