// Uma etapa do fluxo na visão em lista: cabeçalho (tipo, id, selos) que expande para a edição
// completa (ConfigNode). Handle sem ligação = o atendimento termina naquele ponto (fim do turno).
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Badge, IconChip, cn } from '@/shared/ui'
import type { FluxoGrafo, FluxoNode, FluxoProblema } from '@/shared/contracts/_generated/fluxo'
import type { ItemCatalogo } from '../api'
import { arestaDe } from '../grafo'
import { ROTULO_HANDLE, rotuloNode } from '../estados'
import { iconeDoTipo } from '../icones'
import { ConfigNode } from './ConfigNode'

interface Props {
  node: FluxoNode
  grafo: FluxoGrafo
  catalogo: ItemCatalogo[]
  problemas: FluxoProblema[]
  indice: number
  podeEditar: boolean
  onTrocarTipo: (tipo: string) => void
  onConfig: (chave: string, valor: unknown) => void
  onTransicao: (handle: string, para: string | null) => void
  onInicial: () => void
  onRemover: () => void
}

export function CartaoNode({
  node,
  grafo,
  catalogo,
  problemas,
  indice,
  podeEditar,
  onTrocarTipo,
  onConfig,
  onTransicao,
  onInicial,
  onRemover,
}: Props) {
  const [aberto, setAberto] = useState(false)
  const item = catalogo.find((c) => c.tipo === node.tipo)
  const inicial = grafo.inicial === node.id
  const erros = problemas.length
  const Icone = iconeDoTipo(node.tipo)
  const rotuloDestino = (id: string) => {
    const alvo = grafo.nodes.find((n) => n.id === id)
    if (!alvo) return id
    return rotuloNode(alvo.tipo, catalogo.find((c) => c.tipo === alvo.tipo)?.rotulo)
  }

  return (
    <li
      id={`node-${node.id}`}
      className={cn(
        'overflow-hidden rounded-card border bg-cartao transition-colors',
        erros > 0 ? 'border-barro/50' : 'border-linha',
      )}
    >
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="flex min-h-14 w-full items-center gap-3 rounded-card p-4 text-left hover:bg-papel-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
      >
        <IconChip
          tom={erros > 0 ? 'barro' : inicial ? 'salvia' : item?.irreversivel ? 'ambar' : 'neutro'}
          tamanho="md"
          className="relative"
        >
          <Icone strokeWidth={1.75} className="size-5" aria-hidden />
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-cartao text-[10px] font-bold leading-none text-tinta-2 ring-1 ring-linha"
          >
            {indice}
          </span>
        </IconChip>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base font-semibold text-tinta">
            {rotuloNode(node.tipo, item?.rotulo)}
          </span>
          <span className="block truncate font-mono text-xs text-tinta-2">{node.id}</span>
        </span>
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          {inicial && <Badge tom="marca">Início</Badge>}
          {item?.obrigatorio && <Badge>Obrigatória</Badge>}
          {item?.irreversivel && <Badge tom="atencao">Cobra ou efetiva</Badge>}
          {erros > 0 && <Badge tom="erro">{erros === 1 ? '1 problema' : `${erros} problemas`}</Badge>}
        </span>
        <ChevronDown className={cn('size-5 flex-none text-tinta-2 transition-transform', aberto && 'rotate-180')} aria-hidden />
      </button>

      {!aberto && item && item.handles.length > 0 && (
        <p className="-mt-1 px-4 pb-3 pl-[4.25rem] text-xs text-tinta-2">
          {item.handles
            .map((h) => {
              const a = arestaDe(grafo, node.id, h.id)
              return `${ROTULO_HANDLE[h.id] ?? h.rotulo} → ${a ? rotuloDestino(a.para) : 'fim'}`
            })
            .join(' · ')}
        </p>
      )}

      {aberto && (
        <div className="border-t border-linha p-4">
          <ConfigNode
            node={node}
            grafo={grafo}
            catalogo={catalogo}
            problemas={problemas}
            podeEditar={podeEditar}
            onTrocarTipo={onTrocarTipo}
            onConfig={onConfig}
            onTransicao={onTransicao}
            onInicial={onInicial}
            onRemover={onRemover}
          />
        </div>
      )}
    </li>
  )
}
