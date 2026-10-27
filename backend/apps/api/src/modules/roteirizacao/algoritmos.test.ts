// Algoritmos puros da roteirizacao com matrizes sinteticas (sem banco, sem rede).
import { describe, expect, it } from 'vitest'
import { agrupar, type Candidato, type ParamsAgrupar } from './agrupar'
import { centroide, haversineM, matrizLinhaReta } from './geo'
import { consultaEndereco, dentroDaArea } from './geocode'
import { custoCaminho, ordenarParadas } from './ordenar'
import { prontoPrevistoEm } from './preparo'

/** Matriz simetrica de pontos numa reta: no 0 = loja em x=0; tempo = distancia (min). */
const reta = (xs: number[]): number[][] => [0, ...xs].map((a) => [0, ...xs].map((b) => Math.abs(a - b)))

const P: ParamsAgrupar = { janelaSaidaMin: 10, desvioMaxMin: 8, maxPedidos: 4, voltaALoja: false }
const cand = (no: number, prontoMin: number, chave = `p${no}`): Candidato => ({ no, prontoMin, chave })

describe('agrupar', () => {
  it('1 pedido vira 1 corrida', () => {
    expect(agrupar([cand(1, 0)], reta([5]), P)).toEqual([[1]])
  })

  it('agrupa pedidos proximos e com preparo parecido', () => {
    const g = agrupar([cand(1, 0), cand(2, 3), cand(3, 5)], reta([5, 7, 9]), P)
    expect(g).toHaveLength(1)
    expect([...g[0]!].sort()).toEqual([1, 2, 3])
  })

  it('pedido distante (desvio acima do maximo) nao entra e abre outra corrida', () => {
    // dois proximos (5 e 6) e um a 60 min: desvio de 54+ > 8
    const g = agrupar([cand(1, 0), cand(2, 1), cand(3, 2)], reta([5, 6, 60]), P)
    expect(g).toHaveLength(2)
    expect([...g[0]!].sort()).toEqual([1, 2])
    expect(g[1]).toEqual([3])
  })

  it('pedido fora da janela de saida nao entra mesmo estando perto', () => {
    const g = agrupar([cand(1, 0), cand(2, 30)], reta([5, 6]), P)
    expect(g).toEqual([[1], [2]])
  })

  it('capacidade 1 isola cada pedido', () => {
    const g = agrupar([cand(1, 0), cand(2, 0), cand(3, 0)], reta([5, 6, 7]), { ...P, maxPedidos: 1 })
    expect(g).toEqual([[1], [2], [3]])
  })

  it('respeita a capacidade e cria a corrida seguinte com o resto', () => {
    const g = agrupar([1, 2, 3, 4, 5].map((n) => cand(n, 0)), reta([5, 6, 7, 8, 9]), { ...P, maxPedidos: 2 })
    expect(g.map((x) => x.length)).toEqual([2, 2, 1])
  })

  it('empate de preparo e deterministico (desempate pela chave)', () => {
    const t = reta([5, 5])
    const a = agrupar([cand(1, 0, 'b'), cand(2, 0, 'a')], t, { ...P, maxPedidos: 1 })
    expect(a).toEqual([[2], [1]])
  })

  it('matriz assimetrica: o sentido da viagem pesa no acrescimo', () => {
    // ir 0->1 custa 1, 1->2 custa 1, mas voltar e 50 (nao importa em caminho aberto)
    const t = [
      [0, 1, 2],
      [50, 0, 1],
      [50, 50, 0],
    ]
    expect(agrupar([cand(1, 0), cand(2, 0)], t, P)).toEqual([[1, 2]])
    // 2->1 e 1->2 caros: nenhuma insercao cabe no desvio, cada um sai sozinho
    const t2 = [
      [0, 40, 1],
      [50, 0, 50],
      [50, 60, 0],
    ]
    expect(agrupar([cand(1, 0), cand(2, 0)], t2, P)).toEqual([[1], [2]])
  })

  it('mesma entrada, mesma saida (determinismo)', () => {
    const cs = [1, 2, 3, 4, 5, 6].map((n) => cand(n, (n * 3) % 7))
    const t = reta([4, 9, 2, 12, 7, 30])
    expect(agrupar(cs, t, P)).toEqual(agrupar([...cs].reverse(), t, P))
  })

  it('volta a loja encarece o acrescimo (pedido que ida-sozinha caberia fica de fora)', () => {
    const t = reta([5, 11]) // ida: +6 (<= 8); com volta: o acrescimo dobra (+12 > 8)
    expect(agrupar([cand(1, 0), cand(2, 0)], t, P)).toEqual([[1, 2]])
    expect(agrupar([cand(1, 0), cand(2, 0)], t, { ...P, voltaALoja: true })).toEqual([[1], [2]])
  })
})

describe('ordenarParadas', () => {
  it('vizinho mais proximo na reta visita do mais perto ao mais longe', () => {
    expect(ordenarParadas([3, 1, 2], reta([4, 8, 12]), false)).toEqual([1, 2, 3])
  })

  it('2-opt nunca piora o vizinho mais proximo e corrige o caso classico', () => {
    // pontos no plano: NN a partir da loja cai numa armadilha; 2-opt melhora
    const pts = [
      [0, 0], [1, 0], [10, 1], [2, 0], [9, 0], [5, 5],
    ] as const
    const t = pts.map((a) => pts.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])))
    const nos = [1, 2, 3, 4, 5]
    const r = ordenarParadas(nos, t, false)
    expect([...r].sort()).toEqual(nos)
    // melhor que (ou igual a) qualquer ordem trivial crescente
    expect(custoCaminho(r, t, false)).toBeLessThanOrEqual(custoCaminho(nos, t, false) + 1e-9)
  })

  it('com poucos nos acha o otimo (forca bruta)', () => {
    const t = [
      [0, 3, 9, 4],
      [3, 0, 2, 8],
      [9, 2, 0, 3],
      [4, 8, 3, 0],
    ]
    const perms = (a: number[]): number[][] =>
      a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]))
    const otimo = Math.min(...perms([1, 2, 3]).map((p) => custoCaminho(p, t, false)))
    expect(custoCaminho(ordenarParadas([1, 2, 3], t, false), t, false)).toBeCloseTo(otimo)
  })

  it('caminho fechado considera a volta', () => {
    const t = reta([5, 10])
    expect(custoCaminho([1, 2], t, true)).toBe(20)
    expect(ordenarParadas([2, 1], t, true)).toEqual([1, 2])
  })

  it('lista vazia e 1 no', () => {
    expect(ordenarParadas([], reta([]), false)).toEqual([])
    expect(ordenarParadas([1], reta([3]), true)).toEqual([1])
  })
})

describe('preparo, geo e consulta de geocode', () => {
  it('pronto previsto = criado_em + base + itens * por_item', () => {
    const criado = new Date('2026-10-27T15:00:00.000Z')
    expect(prontoPrevistoEm(criado, 3, { preparoBaseMin: 20, preparoPorItemMin: 1.5 }).toISOString()).toBe(
      '2026-10-27T15:24:30.000Z',
    )
    expect(prontoPrevistoEm(criado, 0, { preparoBaseMin: 0, preparoPorItemMin: 2 }).getTime()).toBe(criado.getTime())
  })

  it('haversine bate com a ordem de grandeza e a matriz de linha reta tem diagonal zero', () => {
    const sp = { lat: -23.55, lng: -46.63 }
    const rj = { lat: -22.91, lng: -43.17 }
    expect(haversineM(sp, rj) / 1000).toBeGreaterThan(330)
    expect(haversineM(sp, rj) / 1000).toBeLessThan(370)
    const m = matrizLinhaReta([sp, rj], 30)
    expect(m.estimado).toBe(true)
    expect(m.distM[0]![0]).toBe(0)
    expect(m.tempoMin[0]![1]).toBeGreaterThan(0)
  })

  it('centroide e area plausivel', () => {
    expect(centroide([{ lat: 0, lng: 0 }, { lat: 2, lng: 4 }])).toEqual({ lat: 1, lng: 2 })
    const sp = { lat: -23.55, lng: -46.63 }
    expect(dentroDaArea({ lat: -23.56, lng: -46.64 }, sp)).toBe(true)
    expect(dentroDaArea({ lat: -22.91, lng: -43.17 }, sp)).toBe(false)
    expect(dentroDaArea({ lat: -22.91, lng: -43.17 }, null)).toBe(true)
  })

  it('consulta so com campos de endereco e nula sem logradouro', () => {
    const q = consultaEndereco({
      logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Sao Paulo', uf: 'SP', cep: '01000000',
    })
    expect(q).toBe('Rua A, 10, Centro, Sao Paulo - SP, 01000000, Brasil')
    expect(consultaEndereco({ logradouro: '  ', numero: null, bairro: null, cidade: null, uf: null, cep: null })).toBeNull()
  })
})
