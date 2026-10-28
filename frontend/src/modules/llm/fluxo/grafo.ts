// Operacoes puras sobre o grafo do fluxo (sem React, sem HTTP). O editor estruturado usa estas
// funcoes; a validacao de regra (alcancabilidade, ciclo, node obrigatorio...) e SEMPRE do servidor.
import type { FluxoAresta, FluxoGrafo, FluxoNode } from '@/shared/contracts/_generated/fluxo'

/** Aresta saindo de `de` pelo `handle` (no maximo uma por handle). */
export function arestaDe(g: FluxoGrafo, de: string, handle: string): FluxoAresta | undefined {
  return g.edges.find((e) => e.de === de && e.handle === handle)
}

function proximoNumero(ids: string[], prefixo: string): number {
  let n = 1
  while (ids.includes(`${prefixo}${n}`)) n += 1
  return n
}

/** Liga (ou desliga, com `para` null) o handle de um node. Substitui a aresta anterior do handle. */
export function definirTransicao(g: FluxoGrafo, de: string, handle: string, para: string | null): FluxoGrafo {
  const restantes = g.edges.filter((e) => !(e.de === de && e.handle === handle))
  if (para === null) return { ...g, edges: restantes }
  const id = `e${proximoNumero(restantes.map((e) => e.id), 'e')}`
  return { ...g, edges: [...restantes, { id, de, handle, para }] }
}

/** Adiciona um node do tipo dado, com id unico e posicao a direita dos existentes. */
export function adicionarNode(g: FluxoGrafo, tipo: string): { grafo: FluxoGrafo; id: string } {
  const ids = g.nodes.map((n) => n.id)
  const base = tipo.slice(0, 36)
  const id = ids.includes(base) ? `${base}_${proximoNumero(ids, `${base}_`)}` : base
  const x = g.nodes.reduce((m, n) => Math.max(m, n.posicao.x), -220) + 220
  const node: FluxoNode = { id, tipo, config: {}, posicao: { x, y: 0 } }
  return { grafo: { ...g, nodes: [...g.nodes, node] }, id }
}

/** Remove o node e toda aresta que sai ou chega nele. Se era o inicial, o primeiro restante assume. */
export function removerNode(g: FluxoGrafo, id: string): FluxoGrafo {
  const nodes = g.nodes.filter((n) => n.id !== id)
  const edges = g.edges.filter((e) => e.de !== id && e.para !== id)
  const inicial = g.inicial === id ? (nodes[0]?.id ?? '') : g.inicial
  return { inicial, nodes, edges }
}

/** Troca o tipo do node: zera a config e descarta arestas de handles que o novo tipo nao tem. */
export function trocarTipo(g: FluxoGrafo, id: string, tipo: string, handlesValidos: string[]): FluxoGrafo {
  return {
    ...g,
    nodes: g.nodes.map((n) => (n.id === id ? { ...n, tipo, config: {} } : n)),
    edges: g.edges.filter((e) => e.de !== id || handlesValidos.includes(e.handle)),
  }
}

/** Atualiza uma chave da config do node; valor `undefined` remove a chave (cai no padrao do servidor). */
export function definirConfig(g: FluxoGrafo, id: string, chave: string, valor: unknown): FluxoGrafo {
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      if (n.id !== id) return n
      const config = { ...n.config }
      if (valor === undefined) delete config[chave]
      else config[chave] = valor
      return { ...n, config }
    }),
  }
}

export function grafosIguais(a: FluxoGrafo, b: FluxoGrafo): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
