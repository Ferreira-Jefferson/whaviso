// Filtro de estado da lista de conversas: um dropdown de opcao unica. Numa coluna estreita os
// 5 estados nao cabem em pilulas lado a lado (sobrepoem), entao viram um menu. E UM eixo so: a
// progressao de vida da conversa (automacao -> aguardando -> em atendimento -> encerrada), nao dois
// eixos cruzados (o status_conversa e mutuamente exclusivo; ver historias/backend-api/handoff.md).
// Cada opcao leva o ponto colorido do estado, a mesma cor que ele tem na lista. 'todas' fica no topo,
// separada por um divisor. Mecanica (abrir/fechar, clique fora, teclado) espelha o SeletorLoja do shell.
import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/ui'
import { COR_PONTO_STATUS, ESTADOS_ORDEM, ROTULO_FILTRO, type FiltroStatus } from '../estados'

interface Props {
  value: FiltroStatus
  onChange: (value: FiltroStatus) => void
}

/** Ponto colorido do estado; 'todas' vira um ponto vazado (estado neutro, sem cor propria). */
function Ponto({ status }: { status: FiltroStatus }) {
  if (status === 'todas') {
    return <span aria-hidden className="size-2 flex-none rounded-pill border border-tinta-2/50" />
  }
  return <span aria-hidden className={cn('size-2 flex-none rounded-pill', COR_PONTO_STATUS[status])} />
}

export function FiltroEstado({ value, onChange }: Props) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // Clique fora fecha.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  // Ao abrir, leva o foco para a opcao marcada (melhor navegacao por teclado).
  useEffect(() => {
    if (!aberto) return
    raiz.current?.querySelector<HTMLButtonElement>('[role=menuitemradio][aria-checked=true]')?.focus()
  }, [aberto])

  function selecionar(v: FiltroStatus) {
    onChange(v)
    setAberto(false)
    raiz.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus()
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setAberto(false)
      raiz.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!aberto) {
        setAberto(true)
        return
      }
      const itens = [...(raiz.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]') ?? [])]
      const i = itens.indexOf(document.activeElement as HTMLButtonElement)
      const prox = e.key === 'ArrowDown' ? (i + 1) % itens.length : (i - 1 + itens.length) % itens.length
      itens[prox]?.focus()
      e.preventDefault()
    }
  }

  const rotuloAtual = ROTULO_FILTRO[value]

  return (
    <div ref={raiz} className="relative" onKeyDown={aoTeclar}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={menuId}
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-input border border-linha bg-cartao py-2.5 pl-3 pr-3 text-left text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
      >
        <Ponto status={value} />
        <span className="min-w-0 flex-1 truncate">{rotuloAtual}</span>
        <ChevronDown
          strokeWidth={1.75}
          aria-hidden
          className={cn('size-4 flex-none text-tinta-2 transition-transform', aberto && 'rotate-180')}
        />
      </button>

      {aberto && (
        <div
          id={menuId}
          role="menu"
          aria-label="Filtrar por estado"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-[14px] border border-linha bg-cartao p-2 shadow-[0_12px_32px_rgba(32,50,42,0.14)]"
        >
          <ItemFiltro status="todas" rotulo={ROTULO_FILTRO.todas} marcado={value === 'todas'} aoEscolher={selecionar} />

          <div className="mt-1 border-t border-linha pt-1">
            {ESTADOS_ORDEM.map((estado) => (
              <ItemFiltro
                key={estado}
                status={estado}
                rotulo={ROTULO_FILTRO[estado]}
                marcado={value === estado}
                aoEscolher={selecionar}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ItemFiltro({
  status,
  rotulo,
  marcado,
  aoEscolher,
}: {
  status: FiltroStatus
  rotulo: string
  marcado: boolean
  aoEscolher: (v: FiltroStatus) => void
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={marcado}
      onClick={() => aoEscolher(status)}
      className={cn(
        'flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-sm hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-salvia',
        marcado && 'bg-papel-2 font-bold',
      )}
    >
      <Ponto status={status} />
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
      {marcado && <Check className="size-4 flex-none text-salvia" strokeWidth={2} aria-hidden />}
    </button>
  )
}
