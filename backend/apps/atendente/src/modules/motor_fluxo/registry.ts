// Registry de nodes: tipo -> implementacao do NodeContract. Validado na carga contra o grafo fixo
// (todo node do grafo tem implementacao e vice-versa; toda transicao aponta para um tipo
// conhecido). Invariante do motor-min: nenhum node usa LLM (a fronteira sagrada fica fixada no
// contrato; ver HARNESS-ATENDENTE.md). O motor resolve o node pelo `estado.etapa`.
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
    if (node.usaLlm) throw new ErroRegistry(`node ${node.tipo}: motor-min nao admite usaLlm`)
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
