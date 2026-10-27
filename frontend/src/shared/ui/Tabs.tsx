// Tabs controlado (padrao WAI-ARIA): setas/Home/End movem e ativam; so a aba ativa fica no Tab.
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from './cn'

export interface TabItem {
  id: string
  rotulo: string
  conteudo: ReactNode
}

interface TabsProps {
  itens: ReadonlyArray<TabItem>
  ativa: string
  aoMudar: (id: string) => void
  ariaLabel: string
  className?: string
}

export function Tabs({ itens, ativa, aoMudar, ariaLabel, className }: TabsProps) {
  const base = useId()
  const lista = useRef<HTMLDivElement>(null)

  function aoTeclar(e: KeyboardEvent) {
    const i = itens.findIndex((t) => t.id === ativa)
    let prox = -1
    if (e.key === 'ArrowRight') prox = (i + 1) % itens.length
    else if (e.key === 'ArrowLeft') prox = (i - 1 + itens.length) % itens.length
    else if (e.key === 'Home') prox = 0
    else if (e.key === 'End') prox = itens.length - 1
    if (prox < 0) return
    e.preventDefault()
    const alvo = itens[prox]
    if (!alvo) return
    aoMudar(alvo.id)
    lista.current?.querySelector<HTMLButtonElement>(`[data-tab="${alvo.id}"]`)?.focus()
  }

  const atual = itens.find((t) => t.id === ativa)

  return (
    <div className={className}>
      <div
        ref={lista}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={aoTeclar}
        className="flex gap-1 overflow-x-auto border-b border-linha"
      >
        {itens.map((t) => {
          const sel = t.id === ativa
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              data-tab={t.id}
              aria-selected={sel}
              aria-controls={`${base}-painel-${t.id}`}
              tabIndex={sel ? 0 : -1}
              onClick={() => aoMudar(t.id)}
              className={cn(
                '-mb-px min-h-11 whitespace-nowrap border-b-2 px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-salvia',
                sel ? 'border-salvia font-bold text-salvia' : 'border-transparent text-tinta-2 hover:text-tinta',
              )}
            >
              {t.rotulo}
            </button>
          )
        })}
      </div>
      {atual && (
        <div role="tabpanel" id={`${base}-painel-${atual.id}`} aria-labelledby={`${base}-tab-${atual.id}`} tabIndex={0} className="pt-4">
          {atual.conteudo}
        </div>
      )}
    </div>
  )
}
