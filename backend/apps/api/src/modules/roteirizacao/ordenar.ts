// Ordenacao das paradas de uma corrida: vizinho mais proximo a partir da loja + melhoria 2-opt sobre
// a matriz de tempo. Puro e deterministico (desempate sempre pelo menor indice). Sem solver externo:
// para lotes de ate ~10 paradas e suficiente. O no 0 da matriz e SEMPRE a loja (origem).

/** Custo (minutos) do caminho loja -> ordem... (e de volta a loja quando `volta`). */
export function custoCaminho(ordem: readonly number[], t: readonly (readonly number[])[], volta: boolean): number {
  let custo = 0
  let atual = 0
  for (const n of ordem) {
    custo += t[atual]![n]!
    atual = n
  }
  if (volta && ordem.length > 0) custo += t[atual]![0]!
  return custo
}

const EPS = 1e-9

/** Devolve os `nos` (indices na matriz, sem o 0) na ordem de visita. */
export function ordenarParadas(nos: readonly number[], t: readonly (readonly number[])[], volta: boolean): number[] {
  const restantes = [...nos].sort((a, b) => a - b)
  const ordem: number[] = []
  let atual = 0
  while (restantes.length > 0) {
    let melhor = 0
    for (let i = 1; i < restantes.length; i++) {
      if (t[atual]![restantes[i]!]! < t[atual]![restantes[melhor]!]! - EPS) melhor = i
    }
    atual = restantes.splice(melhor, 1)[0]!
    ordem.push(atual)
  }
  // 2-opt: inverte segmentos enquanto reduzir o custo (recalcula o caminho inteiro: matriz pode ser assimetrica).
  let custo = custoCaminho(ordem, t, volta)
  let melhorou = true
  while (melhorou) {
    melhorou = false
    for (let i = 0; i < ordem.length - 1; i++) {
      for (let j = i + 1; j < ordem.length; j++) {
        const cand = [...ordem.slice(0, i), ...ordem.slice(i, j + 1).reverse(), ...ordem.slice(j + 1)]
        const c = custoCaminho(cand, t, volta)
        if (c < custo - EPS) {
          ordem.splice(0, ordem.length, ...cand)
          custo = c
          melhorou = true
        }
      }
    }
  }
  return ordem
}
