// Idempotencia do ajuste manual de motoboy: reenvio da MESMA chave_idempotencia (duplo-clique/retry)
// e no-op. Mesmo lancamento devolvido, nenhuma 2a linha, nenhum 2o evento, e o total do fechamento do
// dia conta o ajuste UMA vez. Controle: ajustes sem chave (ou com chaves diferentes) criam linhas
// separadas (dedup e escopada a chave). Roda no Postgres local; ver motoboys/tests/harness.ts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hojeSp } from '@whaviso/shared/datas'
import { poolSuper } from '../../../test/db'
import { chamar, encerrar, montarMundo, online, type Mundo } from './tests/harness'

const d = online ? describe : describe.skip
if (!online) console.warn('[motoboys/idempotencia] banco inacessivel: integracao PULADA.')

d('modulo motoboys (idempotencia do ajuste manual)', () => {
  let m: Mundo
  let motoboyId = ''
  const DIA = hojeSp()

  const lancar = (corpo: object) =>
    chamar(m, m.dono, m.A.loja, 'POST', `/${motoboyId}/lancamentos`, corpo)
  const get = () => chamar(m, m.dono, m.A.loja, 'GET', `/fechamentos?data=${DIA}`)

  const contarAjustes = async () => {
    const { rows } = await poolSuper.query<{ n: number }>(
      "select count(*)::int as n from public.motoboy_lancamentos where loja_id = $1 and tipo = 'ajuste'",
      [m.A.loja])
    return rows[0]!.n
  }

  beforeAll(async () => {
    m = await montarMundo()
    const r = await chamar(m, m.dono, m.A.loja, 'POST', '/', { pessoa_id: m.A.pessoaMotoboy })
    motoboyId = r.corpo.id
  })
  afterAll(async () => { if (m) await encerrar(m) })

  it('ajuste com a mesma chave duas vezes: mesmo lancamento, sem 2a linha, sem 2o evento', async () => {
    const corpo = { data: DIA, valor_centavos: 500, descricao: 'Bonus chuva', chave_idempotencia: 'mb-aj-1' }
    const r1 = await lancar(corpo)
    expect(r1.status, JSON.stringify(r1.corpo)).toBe(201)
    const r2 = await lancar(corpo)
    expect(r2.status, JSON.stringify(r2.corpo)).toBe(201)
    expect(r2.corpo.id).toBe(r1.corpo.id)

    expect(await contarAjustes()).toBe(1)
    const ev = await poolSuper.query<{ n: number }>(
      "select count(*)::int as n from public.eventos where loja_id = $1 and tipo = 'motoboy.lancamento_manual'",
      [m.A.loja])
    expect(ev.rows[0]!.n).toBe(1)

    const f = await get()
    expect(f.status, JSON.stringify(f.corpo)).toBe(200)
    expect(f.corpo.linhas).toHaveLength(1)
    expect(f.corpo.linhas[0]).toMatchObject({ motoboy_id: motoboyId, ajustes_centavos: 500, total_centavos: 500 })
    expect(f.corpo.linhas[0].lancamentos).toHaveLength(1)
    expect(f.corpo.total_centavos).toBe(500)
  })

  it('controle: dois ajustes SEM chave criam duas linhas; total soma os dois', async () => {
    const corpo = { data: DIA, valor_centavos: 200, descricao: 'Ajuste avulso' }
    const a = await lancar(corpo)
    const b = await lancar(corpo)
    expect(a.status, JSON.stringify(a.corpo)).toBe(201)
    expect(b.status, JSON.stringify(b.corpo)).toBe(201)
    expect(b.corpo.id).not.toBe(a.corpo.id)

    expect(await contarAjustes()).toBe(3) // 1 deduplicado + 2 avulsos
    const f = await get()
    // 500 (dedup) + 200 + 200 = 900.
    expect(f.corpo.linhas[0]).toMatchObject({ ajustes_centavos: 900, total_centavos: 900 })
    expect(f.corpo.total_centavos).toBe(900)
  })

  it('controle: chaves DIFERENTES criam duas linhas', async () => {
    const r1 = await lancar({ data: DIA, valor_centavos: 100, descricao: 'x', chave_idempotencia: 'mb-aj-a' })
    const r2 = await lancar({ data: DIA, valor_centavos: 100, descricao: 'x', chave_idempotencia: 'mb-aj-b' })
    expect(r1.status, JSON.stringify(r1.corpo)).toBe(201)
    expect(r2.status, JSON.stringify(r2.corpo)).toBe(201)
    expect(r2.corpo.id).not.toBe(r1.corpo.id)

    expect(await contarAjustes()).toBe(5)
    const f = await get()
    // 900 + 100 + 100 = 1100.
    expect(f.corpo.linhas[0]).toMatchObject({ ajustes_centavos: 1100, total_centavos: 1100 })
  })

  it('corrida: dois ajustes com a MESMA chave em paralelo: mesmo id, uma linha so', async () => {
    const corpo = { data: DIA, valor_centavos: 300, descricao: 'Duplo-clique', chave_idempotencia: 'mb-aj-corrida' }
    const [r1, r2] = await Promise.all([lancar(corpo), lancar(corpo)])
    expect(r1.status, JSON.stringify(r1.corpo)).toBe(201)
    expect(r2.status, JSON.stringify(r2.corpo)).toBe(201)
    expect(r2.corpo.id).toBe(r1.corpo.id)

    // Uma unica linha com essa chave e um unico evento; o indice unico parcial fecha a corrida.
    const { rows } = await poolSuper.query<{ n: number }>(
      'select count(*)::int as n from public.motoboy_lancamentos where loja_id = $1 and chave_idempotencia = $2',
      [m.A.loja, 'mb-aj-corrida'])
    expect(rows[0]!.n).toBe(1)
    expect(await contarAjustes()).toBe(6) // 5 anteriores + 1 desta corrida
  })
})
