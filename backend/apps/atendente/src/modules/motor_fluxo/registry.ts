// Registry de nodes: tipo -> implementacao do NodeContract. Validado na carga contra o grafo fixo
// (todo node do grafo tem implementacao e vice-versa; toda transicao aponta para um tipo
// conhecido). Invariante: so os nodes de NODES_COM_LLM declaram `usaLlm` (a fronteira sagrada fica
// fixada no contrato; ver HARNESS-ATENDENTE.md). O motor resolve o node pelo `estado.etapa`.
import type { NodeContract, NodeRegistry } from '@whaviso/shared/contracts'
import { GRAFO } from './grafo'
import { saudacaoNode } from './nodes/saudacao'
import { pedirCategoriaNode } from './nodes/pedir_categoria'
import { montarPedidoNode } from './nodes/montar_pedido'
import { confirmarNode } from './nodes/confirmar'
import { enderecoNode } from './nodes/endereco'
import { pagamentoNode } from './nodes/pagamento'
import { acompanharNode } from './nodes/acompanhar'

const NODES: NodeContract[] = [
  saudacaoNode as NodeContract,
  pedirCategoriaNode as NodeContract,
  montarPedidoNode as NodeContract,
  confirmarNode as NodeContract,
  enderecoNode as NodeContract,
  pagamentoNode as NodeContract,
  acompanharNode as NodeContract,
]

/**
 * Unicos nodes cujo TEXTO LIVRE pode ir ao harness (entendimento de linguagem natural). O flag
 * `usaLlm` do node so declara isso: o node em si segue deterministico (botao/regra) e quem chama o
 * harness e o motor. Os demais (saudacao com gate de horario, confirmar, endereco, pagamento,
 * acompanhar) nunca usam LLM. Qualquer divergencia entre o flag e esta lista derruba o boot.
 */
export const NODES_COM_LLM: ReadonlySet<string> = new Set(['pedir_categoria', 'montar_pedido'])

export class ErroRegistry extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroRegistry'
  }
}

/** Monta e VALIDA o registry contra o grafo fixo. Lanca ErroRegistry em qualquer inconsistencia. */
export function criarRegistry(): NodeRegistry {
  const registry: NodeRegistry = new Map()
  for (const node of NODES) {
    if (!node.tipo) throw new ErroRegistry('node sem tipo')
    if (node.usaLlm && !NODES_COM_LLM.has(node.tipo)) {
      throw new ErroRegistry(`node ${node.tipo}: usaLlm so e admitido nos nodes de entendimento de texto livre`)
    }
    if (!node.usaLlm && NODES_COM_LLM.has(node.tipo)) {
      throw new ErroRegistry(`node ${node.tipo}: deveria declarar usaLlm (entendimento de texto livre)`)
    }
    if (!node.configSchema) throw new ErroRegistry(`node ${node.tipo}: sem configSchema`)
    if (registry.has(node.tipo)) throw new ErroRegistry(`node duplicado: ${node.tipo}`)
    registry.set(node.tipo, node)
  }

  const tiposGrafo = Object.keys(GRAFO.nodes)
  for (const tipo of tiposGrafo) {
    if (!registry.has(tipo)) throw new ErroRegistry(`grafo referencia node sem implementacao: ${tipo}`)
  }
  for (const tipo of registry.keys()) {
    if (!tiposGrafo.includes(tipo)) throw new ErroRegistry(`node fora do grafo: ${tipo}`)
  }
  for (const [tipo, def] of Object.entries(GRAFO.nodes)) {
    for (const proximo of def.proximos) {
      if (proximo !== null && !registry.has(proximo)) {
        throw new ErroRegistry(`transicao invalida ${tipo} -> ${proximo}`)
      }
    }
  }
  return registry
}
