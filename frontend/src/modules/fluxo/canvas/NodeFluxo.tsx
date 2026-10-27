// Node do canvas (React Flow) no visual Calmo Editorial: mesmo ícone, selos e cor de erro do cartão
// em lista, para a etapa ser reconhecida igual nas duas visões. Uma entrada (esquerda) e uma saída
// por handle do contrato (direita), rotulada. Memoizado: só redesenha quando os dados mudam.
import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Badge, IconChip, cn } from '@/shared/ui'
import { iconeDoTipo } from '../icones'

export interface FluxoNodeData extends Record<string, unknown> {
  tipo: string
  rotulo: string
  indice: number
  inicial: boolean
  obrigatorio: boolean
  irreversivel: boolean
  erros: number
  handles: { id: string; rotulo: string }[]
}

export type FluxoRFNode = Node<FluxoNodeData, 'fluxo'>

function NodeFluxoBase({ id, data, selected }: NodeProps<FluxoRFNode>) {
  const Icone = iconeDoTipo(data.tipo)
  const temErro = data.erros > 0
  const n = data.handles.length

  return (
    <div
      className={cn(
        'relative w-56 rounded-card border bg-cartao px-3 py-2.5 shadow-sm transition-shadow',
        temErro ? 'border-barro/60' : selected ? 'border-salvia' : 'border-linha',
        selected && 'shadow-[0_0_0_2px_var(--color-salvia)]',
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-2.5 !border-2 !border-cartao !bg-tinta-2" />

      <div className="flex items-center gap-2.5">
        <IconChip
          tom={temErro ? 'barro' : data.inicial ? 'salvia' : data.irreversivel ? 'ambar' : 'neutro'}
          tamanho="sm"
        >
          <Icone strokeWidth={1.75} className="size-4" aria-hidden />
        </IconChip>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-sm font-semibold text-tinta">{data.rotulo}</div>
          <div className="truncate font-mono text-[11px] text-tinta-2">{id}</div>
        </div>
        <span className="tabular flex size-5 flex-none items-center justify-center rounded-full bg-papel-2 text-[10px] font-bold text-tinta-2">
          {data.indice}
        </span>
      </div>

      {(data.inicial || data.obrigatorio || data.irreversivel || temErro) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.inicial && <Badge tom="marca">Início</Badge>}
          {data.obrigatorio && <Badge>Obrigatória</Badge>}
          {data.irreversivel && <Badge tom="atencao">Cobra ou efetiva</Badge>}
          {temErro && <Badge tom="erro">{data.erros === 1 ? '1 problema' : `${data.erros} problemas`}</Badge>}
        </div>
      )}

      {n > 0 ? (
        <div className="mt-2 flex flex-col gap-1.5 border-t border-linha pt-2">
          {data.handles.map((h) => (
            <div key={h.id} className="flex items-center justify-end gap-1.5 text-[11px] text-tinta-2">
              <span className="truncate">{h.rotulo}</span>
              <Handle
                id={h.id}
                type="source"
                position={Position.Right}
                style={{ position: 'relative', top: 'auto', right: 'auto', transform: 'none' }}
                className="!size-2.5 !border-2 !border-cartao !bg-salvia"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 border-t border-linha pt-2 text-right text-[11px] text-tinta-2">Etapa final</div>
      )}
    </div>
  )
}

export const NodeFluxo = memo(NodeFluxoBase)
