// Uma etapa do fluxo: tipo, configuracao (gerada do catalogo) e para onde cada saida leva.
// Handle sem ligacao = o atendimento termina naquele ponto (fim do turno).
import {
  CheckCircle2,
  ChevronDown,
  CircleDot,
  CreditCard,
  Flag,
  ListChecks,
  MapPin,
  MessageCircle,
  PackageSearch,
  ShoppingCart,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Badge, IconChip, Select, cn } from '@/shared/ui'
import type { FluxoGrafo, FluxoNode, FluxoProblema } from '@/shared/contracts/_generated/fluxo'
import type { ItemCatalogo } from '../api'
import { arestaDe } from '../grafo'
import { ROTULO_HANDLE, rotuloNode } from '../estados'
import { CampoConfig } from './CampoConfig'

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

const FIM = '__fim__'

// Icone por tipo de etapa: ancora visual para reconhecer a etapa de relance, sem implicar ordem.
const ICONE_TIPO: Record<string, LucideIcon> = {
  saudacao: MessageCircle,
  pedir_categoria: ListChecks,
  montar_pedido: ShoppingCart,
  confirmar: CheckCircle2,
  endereco: MapPin,
  pagamento: CreditCard,
  acompanhar: PackageSearch,
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
  const Icone = ICONE_TIPO[node.tipo] ?? CircleDot
  const rotuloDestino = (id: string) => {
    const alvo = grafo.nodes.find((n) => n.id === id)
    if (!alvo) return id
    return rotuloNode(alvo.tipo, catalogo.find((c) => c.tipo === alvo.tipo)?.rotulo)
  }
  const destinos = [
    { value: FIM, label: 'Encerra o atendimento aqui' },
    ...grafo.nodes.map((n) => ({
      value: n.id,
      label: `${rotuloNode(n.tipo, catalogo.find((c) => c.tipo === n.tipo)?.rotulo)} (${n.id})`,
    })),
  ]
  const tipos = catalogo.map((c) => ({ value: c.tipo, label: rotuloNode(c.tipo, c.rotulo) }))

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
        <div className="flex flex-col gap-4 border-t border-linha p-4">
          {problemas.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-barro">
              {problemas.map((p, i) => (
                <li key={i}>{p.mensagem}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-tinta">Tipo da etapa</span>
            <Select
              value={node.tipo}
              onChange={onTrocarTipo}
              options={tipos}
              ariaLabel="Tipo da etapa"
              disabled={!podeEditar}
            />
            <span className="text-xs text-tinta-2">Trocar o tipo apaga a configuração e as saídas que não existem no novo.</span>
          </div>

          {item && (
            <CampoConfig
              esquema={item.config_schema}
              valores={node.config}
              onMudar={(c, v) => podeEditar && onConfig(c, v)}
            />
          )}

          {item && item.handles.length > 0 && (
            <div className="flex flex-col gap-3">
              <h4 className="text-sm font-medium text-tinta">Para onde vai depois</h4>
              {item.handles.map((h) => {
                const a = arestaDe(grafo, node.id, h.id)
                return (
                  <div key={h.id} className="flex flex-col gap-1.5">
                    <span className="text-sm text-tinta-2">{ROTULO_HANDLE[h.id] ?? h.rotulo}</span>
                    <Select
                      value={a?.para ?? FIM}
                      onChange={(v) => onTransicao(h.id, v === FIM ? null : v)}
                      options={destinos}
                      ariaLabel={`Destino de "${ROTULO_HANDLE[h.id] ?? h.rotulo}"`}
                      disabled={!podeEditar}
                    />
                  </div>
                )
              })}
            </div>
          )}
          {item && item.handles.length === 0 && (
            <p className="text-sm text-tinta-2">Etapa final: o atendimento termina aqui.</p>
          )}

          {podeEditar && (
            <div className="flex flex-wrap gap-2 border-t border-linha pt-3">
              {!inicial && (
                <button
                  type="button"
                  onClick={onInicial}
                  className="inline-flex min-h-11 items-center gap-2 rounded-pill border border-linha px-4 text-sm font-medium text-tinta hover:bg-papel-2"
                >
                  <Flag className="size-4" aria-hidden /> Tornar etapa inicial
                </button>
              )}
              <button
                type="button"
                onClick={onRemover}
                className="inline-flex min-h-11 items-center gap-2 rounded-pill px-4 text-sm font-medium text-barro hover:bg-barro/10"
              >
                <Trash2 className="size-4" aria-hidden /> Remover etapa
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
