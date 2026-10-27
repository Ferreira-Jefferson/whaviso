// Agrupamento de pedidos prontos em corridas sugeridas (puro, deterministico).
// Semeia cada corrida com o pedido de pronto mais cedo ainda sem grupo e agrega candidatos enquanto:
//  (a) |pronto - pronto_semente| <= janela de saida;
//  (b) o acrescimo de tempo da insercao de menor custo <= desvio maximo;
//  (c) a corrida nao excede a capacidade.
// A cada passo entra o candidato de MENOR acrescimo (desempate: pronto mais cedo, depois chave).
import { custoCaminho } from './ordenar'

export interface Candidato {
  /** Indice do no na matriz de tempos (>= 1; o 0 e a loja). */
  no: number
  /** Pronto previsto em minutos (qualquer origem fixa; so a diferenca importa). */
  prontoMin: number
  /** Desempate estavel (ex.: id do pedido). */
  chave: string
}

export interface ParamsAgrupar {
  janelaSaidaMin: number
  desvioMaxMin: number
  maxPedidos: number
  voltaALoja: boolean
}

const EPS = 1e-9

/** Acrescimo da insercao de menor custo de `no` na rota (loja fora da lista). */
function melhorInsercao(
  rota: readonly number[], no: number, t: readonly (readonly number[])[], volta: boolean,
): { delta: number; pos: number } {
  const base = custoCaminho(rota, t, volta)
  let melhor = { delta: Infinity, pos: 0 }
  for (let pos = 0; pos <= rota.length; pos++) {
    const nova = [...rota.slice(0, pos), no, ...rota.slice(pos)]
    const delta = custoCaminho(nova, t, volta) - base
    if (delta < melhor.delta - EPS) melhor = { delta, pos }
  }
  return melhor
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Devolve grupos de nos (na ordem de insercao; a ordem final de parada e do `ordenar`). */
export function agrupar(
  candidatos: readonly Candidato[], t: readonly (readonly number[])[], p: ParamsAgrupar,
): number[][] {
  const fila = [...candidatos].sort((a, b) => a.prontoMin - b.prontoMin || cmp(a.chave, b.chave))
  const usados = new Set<number>()
  const grupos: number[][] = []
  for (const semente of fila) {
    if (usados.has(semente.no)) continue
    usados.add(semente.no)
    let rota: number[] = [semente.no]
    while (rota.length < p.maxPedidos) {
      let escolhido: { no: number; delta: number; pos: number } | null = null
      for (const c of fila) {
        if (usados.has(c.no)) continue
        if (Math.abs(c.prontoMin - semente.prontoMin) > p.janelaSaidaMin + EPS) continue
        const ins = melhorInsercao(rota, c.no, t, p.voltaALoja)
        if (ins.delta > p.desvioMaxMin + EPS) continue
        // `fila` ja esta em ordem de pronto/chave: so troca se estritamente melhor (desempate estavel).
        if (!escolhido || ins.delta < escolhido.delta - EPS) escolhido = { no: c.no, delta: ins.delta, pos: ins.pos }
      }
      if (!escolhido) break
      usados.add(escolhido.no)
      rota = [...rota.slice(0, escolhido.pos), escolhido.no, ...rota.slice(escolhido.pos)]
    }
    grupos.push(rota)
  }
  return grupos
}
