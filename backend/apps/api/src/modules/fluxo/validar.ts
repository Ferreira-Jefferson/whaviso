// Validador PURO do grafo de atendimento (sem banco, sem relogio, deterministico). O grafo e entrada
// nao confiavel (vem do navegador): toda regra de seguranca roda aqui, no servidor, na publicacao.
// Nao executa o grafo (o motor vive no atendente); faz analise estatica de forma e de caminhos.
import {
  CATALOGO_NODES, FLUXO_LIMITES,
  type FluxoErroCodigo, type FluxoGrafo, type FluxoProblema, type FluxoValidacao, type NodeDescritor,
} from './schemas'

const DESCRITORES = new Map<string, NodeDescritor>(CATALOGO_NODES.map((d) => [d.tipo, d]))

function problema(
  codigo: FluxoErroCodigo, mensagem: string, nodeId: string | null = null, edgeId: string | null = null,
): FluxoProblema {
  return { codigo, mensagem, node_id: nodeId, edge_id: edgeId }
}

function profundidade(v: unknown, nivel = 1): number {
  if (v === null || typeof v !== 'object') return nivel
  let max = nivel
  for (const f of Object.values(v as Record<string, unknown>)) max = Math.max(max, profundidade(f, nivel + 1))
  return max
}

/** BFS a partir de `origens` seguindo `adj`; `bloqueados` sao visitados mas nao expandidos. */
function alcance(origens: string[], adj: Map<string, string[]>, bloqueados = new Set<string>()): Set<string> {
  const vistos = new Set<string>()
  const fila = [...origens]
  while (fila.length > 0) {
    const n = fila.shift()!
    if (vistos.has(n)) continue
    vistos.add(n)
    if (bloqueados.has(n)) continue
    for (const p of adj.get(n) ?? []) if (!vistos.has(p)) fila.push(p)
  }
  return vistos
}

export function validarGrafo(g: FluxoGrafo): FluxoValidacao {
  const erros: FluxoProblema[] = []

  // 1. limites (curto-circuito: nao analisa grafo gigante).
  if (g.nodes.length > FLUXO_LIMITES.nodes) {
    erros.push(problema('limite_excedido', `Maximo de ${FLUXO_LIMITES.nodes} nodes`))
  }
  if (g.edges.length > FLUXO_LIMITES.arestas) {
    erros.push(problema('limite_excedido', `Maximo de ${FLUXO_LIMITES.arestas} conexoes`))
  }
  if (Buffer.byteLength(JSON.stringify(g), 'utf8') > FLUXO_LIMITES.bytes) {
    erros.push(problema('limite_excedido', `Grafo acima de ${FLUXO_LIMITES.bytes} bytes`))
  }
  if (erros.length > 0) return { valido: false, erros, avisos: [] }

  // 2. ids unicos.
  const nodes = new Map<string, FluxoGrafo['nodes'][number]>()
  for (const n of g.nodes) {
    if (nodes.has(n.id)) erros.push(problema('id_duplicado', 'Id de node repetido', n.id))
    else nodes.set(n.id, n)
  }
  const idsArestas = new Set<string>()
  for (const e of g.edges) {
    if (idsArestas.has(e.id)) erros.push(problema('id_duplicado', 'Id de conexao repetido', null, e.id))
    idsArestas.add(e.id)
  }

  // 3. tipo do catalogo fechado e config pelo Zod do node.
  for (const n of nodes.values()) {
    const d = DESCRITORES.get(n.tipo)
    if (!d) {
      erros.push(problema('no_desconhecido', 'Tipo de node fora do catalogo', n.id))
      continue
    }
    if (profundidade(n.config) > FLUXO_LIMITES.profundidadeConfig) {
      erros.push(problema('limite_excedido', 'Configuracao muito aninhada', n.id))
      continue
    }
    const r = d.configSchema.safeParse(n.config)
    if (!r.success) {
      const i = r.error.issues[0]
      const campo = i && i.path.length > 0 ? ` (${i.path.join('.')})` : ''
      erros.push(problema('config_invalida', `Configuracao invalida${campo}`, n.id))
    }
  }

  // 4. conexoes: origem/destino existentes, handle do catalogo, 1 conexao por handle, sem sair de `encerrar`.
  const adj = new Map<string, string[]>()
  const usados = new Set<string>()
  for (const e of g.edges) {
    const de = nodes.get(e.de)
    const para = nodes.get(e.para)
    if (!de || !para) {
      erros.push(problema('aresta_invalida', 'Conexao com node de origem ou destino inexistente', null, e.id))
      continue
    }
    const d = DESCRITORES.get(de.tipo)
    if (!d) continue // ja reportado como no_desconhecido
    const handle = d.handles.find((x) => x.id === e.handle)
    if (!handle) {
      erros.push(problema('aresta_invalida', 'Handle inexistente no node de origem', e.de, e.id))
      continue
    }
    if (handle.encerra) {
      erros.push(problema('aresta_invalida', 'O handle de encerramento nao pode ser conectado', e.de, e.id))
      continue
    }
    const chave = `${e.de}\u0000${e.handle}`
    if (usados.has(chave)) {
      erros.push(problema('aresta_invalida', 'Handle com mais de uma conexao', e.de, e.id))
      continue
    }
    usados.add(chave)
    adj.set(e.de, [...(adj.get(e.de) ?? []), e.para])
  }

  // 5. inicio.
  if (!nodes.has(g.inicial)) {
    erros.push(problema('sem_inicio', 'Node inicial inexistente', g.inicial))
    return fechar(erros)
  }

  // 6. alcancabilidade.
  const alcancados = alcance([g.inicial], adj)
  for (const id of nodes.keys()) {
    if (!alcancados.has(id)) erros.push(problema('no_inalcancavel', 'Node inalcancavel a partir do inicio', id))
  }

  // 7. nodes obrigatorios (alcancaveis).
  for (const d of CATALOGO_NODES) {
    if (!d.obrigatorio) continue
    const existe = [...alcancados].some((id) => nodes.get(id)?.tipo === d.tipo)
    if (!existe) erros.push(problema('no_obrigatorio_ausente', `Node obrigatorio ausente: ${d.tipo}`))
  }

  // 8. todo node alcancavel precisa de caminho ate um node terminal (o fluxo tem que poder concluir;
  // `encerrar` so fecha o turno e nao conta como saida).
  const reverso = new Map<string, string[]>()
  for (const [de, paras] of adj) for (const p of paras) reverso.set(p, [...(reverso.get(p) ?? []), de])
  const saidas: string[] = []
  for (const id of alcancados) {
    if (DESCRITORES.get(nodes.get(id)!.tipo)?.terminal) saidas.push(id)
  }
  const chegaEmSaida = alcance(saidas, reverso)
  for (const id of alcancados) {
    if (chegaEmSaida.has(id)) continue
    const emCiclo = (adj.get(id) ?? []).some((p) => alcance([p], adj).has(id))
    erros.push(
      emCiclo
        ? problema('ciclo_sem_saida', 'Ciclo sem saida: nenhum caminho leva ao fim do fluxo', id)
        : problema('sem_saida', 'Nenhum caminho deste node leva a um node terminal', id),
    )
  }

  // 9. acao irreversivel so depois de `confirmar`: sem os nodes confirmar, nenhum irreversivel e alcancavel.
  const confirmar = new Set([...nodes.values()].filter((n) => n.tipo === 'confirmar').map((n) => n.id))
  const semConfirmar = alcance([g.inicial], adj, confirmar)
  for (const id of semConfirmar) {
    const n = nodes.get(id)!
    if (n.tipo !== 'confirmar' && DESCRITORES.get(n.tipo)?.irreversivel) {
      erros.push(
        problema('acao_irreversivel_sem_confirmacao', 'Ha caminho que chega aqui sem passar por confirmar', id),
      )
    }
  }

  return fechar(erros)
}

function fechar(erros: FluxoProblema[]): FluxoValidacao {
  erros.sort(
    (a, b) =>
      a.codigo.localeCompare(b.codigo) ||
      (a.node_id ?? '').localeCompare(b.node_id ?? '') ||
      (a.edge_id ?? '').localeCompare(b.edge_id ?? ''),
  )
  return { valido: erros.length === 0, erros, avisos: [] }
}
