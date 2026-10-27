// Renderizador do canvas do fluxo (chunk pesado: React Flow, carregado sob demanda pelo FluxoCanvas).
// Lê o grafo (nodes = etapas, arestas = transições) e desenha com zoom, pan, minimapa e controles.
// Interação leve: selecionar uma etapa (abre a configuração ao lado) e arrastar para reposicionar
// (a posição volta para o grafo e vira rascunho, como qualquer alteração). A validade continua sendo
// do servidor; aqui só espelhamos os problemas (borda vermelha + selo) que a api devolve.
import { useEffect, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesState,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { FluxoGrafo, FluxoProblema } from '@/shared/contracts/_generated/fluxo'
import type { ItemCatalogo } from '../api'
import { ROTULO_HANDLE, rotuloNode } from '../estados'
import { NodeFluxo, type FluxoNodeData, type FluxoRFNode } from './NodeFluxo'

interface Props {
  grafo: FluxoGrafo
  catalogo: ItemCatalogo[]
  problemas: FluxoProblema[]
  selecionado: string | null
  onSelecionar: (id: string | null) => void
  onMover: (id: string, x: number, y: number) => void
  podeEditar: boolean
}

function montarNodes(
  grafo: FluxoGrafo,
  catalogo: ItemCatalogo[],
  problemas: FluxoProblema[],
  selecionado: string | null,
): FluxoRFNode[] {
  return grafo.nodes.map((n, i) => {
    const item = catalogo.find((c) => c.tipo === n.tipo)
    const data: FluxoNodeData = {
      tipo: n.tipo,
      rotulo: rotuloNode(n.tipo, item?.rotulo),
      indice: i + 1,
      inicial: grafo.inicial === n.id,
      obrigatorio: item?.obrigatorio ?? false,
      irreversivel: item?.irreversivel ?? false,
      erros: problemas.filter((p) => p.node_id === n.id).length,
      handles: (item?.handles ?? []).map((h) => ({ id: h.id, rotulo: ROTULO_HANDLE[h.id] ?? h.rotulo })),
    }
    return {
      id: n.id,
      type: 'fluxo',
      position: { x: n.posicao.x, y: n.posicao.y },
      data,
      selected: selecionado === n.id,
    }
  })
}

export default function FluxoCanvasReactFlow({
  grafo,
  catalogo,
  problemas,
  selecionado,
  onSelecionar,
  onMover,
  podeEditar,
}: Props) {
  const nodeTypes = useMemo(() => ({ fluxo: NodeFluxo }), [])
  const [nodes, setNodes, onNodesChange] = useNodesState<FluxoRFNode>(
    montarNodes(grafo, catalogo, problemas, selecionado),
  )

  // Reconstrói os nodes quando a ESTRUTURA/dados mudam (tipo, inicial, problemas, seleção). As
  // posições não entram na assinatura: arrastar não dispara reconstrução (evita o node "pular" de
  // volta). Restaurar versão remonta o editor inteiro (key no EditorFluxo), então relê as posições.
  const assinatura = useMemo(
    () =>
      JSON.stringify(
        grafo.nodes.map((n) => [
          n.id,
          n.tipo,
          grafo.inicial === n.id,
          problemas.filter((p) => p.node_id === n.id).length,
        ]),
      ) + `|${selecionado}`,
    [grafo.nodes, grafo.inicial, problemas, selecionado],
  )
  useEffect(() => {
    setNodes(montarNodes(grafo, catalogo, problemas, selecionado))
    // Só a assinatura decide a reconstrução; as demais deps são lidas de forma estável.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura])

  const edges: Edge[] = useMemo(
    () =>
      grafo.edges.map((e) => {
        const ligadaSelecao = selecionado !== null && (e.de === selecionado || e.para === selecionado)
        return {
          id: e.id,
          source: e.de,
          target: e.para,
          sourceHandle: e.handle,
          type: 'smoothstep',
          label: ROTULO_HANDLE[e.handle] ?? e.handle,
          labelBgPadding: [6, 2] as [number, number],
          labelBgBorderRadius: 8,
          labelBgStyle: { fill: '#faf7f0', fillOpacity: 0.9 },
          labelStyle: { fill: '#5c6b62', fontSize: 11, fontFamily: 'Karla, system-ui, sans-serif' },
          style: { stroke: ligadaSelecao ? '#1e4d3b' : '#c9c0ac', strokeWidth: ligadaSelecao ? 2 : 1.5 },
        }
      }),
    [grafo.edges, selecionado],
  )

  return (
    <ReactFlow<FluxoRFNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_e, node) => onMover(node.id, node.position.x, node.position.y)}
      onNodeClick={(_e, node) => onSelecionar(node.id)}
      onPaneClick={() => onSelecionar(null)}
      nodesDraggable={podeEditar}
      nodesConnectable={false}
      elementsSelectable
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
      minZoom={0.2}
      maxZoom={1.75}
      proOptions={{ hideAttribution: false }}
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#e5decf" />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={(n) => ((n.data as FluxoNodeData)?.inicial ? '#1e4d3b' : '#c9c0ac')}
        maskColor="rgba(243,238,227,0.6)"
      />
    </ReactFlow>
  )
}
