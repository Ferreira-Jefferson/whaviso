// Ícone de informação com tooltip: explica um campo SEM ocupar uma linha abaixo
// dele (que desalinha grids). Abre no hover e no foco (teclado) e alterna no clique
// (toque). type="button" para nunca submeter o formulário em volta. Acessível:
// botão com aria-label e tooltip ligado por aria-describedby.
import { useId, useState } from 'react'
import { Info } from 'lucide-react'

export function InfoHint({ texto, rotulo }: { texto: string; rotulo?: string }) {
  const id = useId()
  const [aberto, setAberto] = useState(false)

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={rotulo ?? 'Mais informações'}
        aria-describedby={aberto ? id : undefined}
        className="rounded-full text-tinta-2 transition-colors hover:text-salvia focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onClick={(e) => {
          e.preventDefault()
          setAberto((v) => !v)
        }}
      >
        <Info strokeWidth={1.75} className="size-3.5" />
      </button>
      {aberto && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-lg bg-tinta px-3 py-2 text-xs leading-snug font-normal text-papel shadow-lg"
        >
          {texto}
        </span>
      )}
    </span>
  )
}
