// Seletor de loja do topo do shell (ver docs/pivot/mocks/shell/shell.html).
import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../ui/cn'
import { calcularBranding } from './branding'
import { iniciais } from './iniciais'
import type { LojaResumo } from './contratos'
import { useTenant } from './context'

export function AvatarLoja({ loja, className }: { loja: LojaResumo; className?: string }) {
  const marca = calcularBranding(loja.cores)
  // logo_url so e usado em <img> se for https (defesa em profundidade; a api ja valida por allowlist).
  const logo = loja.logo_url && /^https:\/\//i.test(loja.logo_url) ? loja.logo_url : null
  return logo ? (
    <img src={logo} alt="" className={cn('size-8 flex-none rounded-full bg-papel-2 object-cover', className)} />
  ) : (
    <span
      aria-hidden
      style={marca ? { background: marca.primaria, color: marca.sobrePrimaria } : undefined}
      className={cn(
        'flex size-8 flex-none items-center justify-center rounded-full bg-salvia text-sm font-bold text-sobre-marca',
        className,
      )}
    >
      {iniciais(loja.nome)}
    </span>
  )
}

export function SeletorLoja() {
  const { lojas, lojaAtiva, selecionarLoja } = useTenant()
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  if (!lojaAtiva) return null

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setAberto(false)
      raiz.current?.querySelector<HTMLButtonElement>('button[aria-haspopup]')?.focus()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const itens = [...(raiz.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]') ?? [])]
      const i = itens.indexOf(document.activeElement as HTMLButtonElement)
      const prox = e.key === 'ArrowDown' ? (i + 1) % itens.length : (i - 1 + itens.length) % itens.length
      itens[prox]?.focus()
      e.preventDefault()
    }
  }

  return (
    <div ref={raiz} className="relative min-w-0" onKeyDown={aoTeclar}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={menuId}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-11 w-full max-w-[340px] items-center gap-2.5 rounded-pill border border-linha bg-cartao py-1.5 pl-1.5 pr-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
      >
        <AvatarLoja loja={lojaAtiva} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold leading-tight">{lojaAtiva.nome}</span>
          <span className="block text-xs leading-tight text-tinta-2">
            {lojas.length > 1 ? 'Trocar de loja' : 'Loja ativa'}
          </span>
        </span>
        {lojas.length > 1 && <ChevronDown className="size-5 flex-none text-tinta-2" strokeWidth={1.75} aria-hidden />}
      </button>

      {aberto && lojas.length > 1 && (
        <div
          id={menuId}
          role="menu"
          aria-label="Lojas"
          className="absolute left-0 top-[calc(100%+6px)] z-30 w-[min(340px,calc(100vw-32px))] rounded-[14px] border border-linha bg-cartao p-2 shadow-[0_12px_32px_rgba(32,50,42,0.14)]"
        >
          {lojas.map((l) => {
            const ativa = l.id === lojaAtiva.id
            return (
              <button
                key={l.id}
                type="button"
                role="menuitemradio"
                aria-checked={ativa}
                onClick={() => {
                  selecionarLoja(l.id)
                  setAberto(false)
                }}
                className={cn(
                  'flex min-h-12 w-full items-center gap-3 rounded-[10px] p-2.5 text-left hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-salvia',
                  ativa && 'bg-papel-2',
                )}
              >
                <AvatarLoja loja={l} />
                <span className="min-w-0 flex-1 truncate font-bold">{l.nome}</span>
                {ativa && <Check className="size-5 text-salvia" strokeWidth={1.75} aria-hidden />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
