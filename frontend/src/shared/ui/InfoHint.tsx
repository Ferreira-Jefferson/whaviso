// Ícone de informação com tooltip: explica um campo SEM ocupar uma linha abaixo
// dele (que desalinha grids). Abre no hover e no foco (teclado) e alterna no clique
// (toque). type="button" para nunca submeter o formulário em volta. Acessível:
// botão com aria-label e tooltip ligado por aria-describedby.
//
// O tooltip nasce centralizado no ícone, mas se AUTOAJUSTA na horizontal para nunca
// sair da viewport (essencial no mobile: um label comprido joga o ícone para a direita
// e o tooltip centralizado vazaria a borda em telas estreitas). Mede a posição real e
// aplica um deslocamento em px por cima do translate de centralização.
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'

const MARGEM = 8

export function InfoHint({ texto, rotulo }: { texto: string; rotulo?: string }) {
  const id = useId()
  const [aberto, setAberto] = useState(false)
  const [desloc, setDesloc] = useState(0)
  const tipRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!aberto || !tipRef.current) return
    const r = tipRef.current.getBoundingClientRect()
    // posição "natural" (sem o deslocamento já aplicado), para o cálculo ser idempotente.
    const naturalEsq = r.left - desloc
    const naturalDir = r.right - desloc
    const vw = document.documentElement.clientWidth
    let novo = 0
    if (naturalDir > vw - MARGEM) novo = vw - MARGEM - naturalDir
    else if (naturalEsq < MARGEM) novo = MARGEM - naturalEsq
    if (novo !== desloc) setDesloc(novo)
  }, [aberto, desloc, texto])

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
        <CircleHelp strokeWidth={1.75} className="size-3.5" />
      </button>
      {aberto && (
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${desloc}px))` }}
          className="absolute bottom-full left-1/2 z-20 mb-2 w-52 max-w-[calc(100vw-1rem)] rounded-lg bg-tinta px-3 py-2 text-xs leading-snug font-normal text-papel shadow-lg"
        >
          {texto}
        </span>
      )}
    </span>
  )
}
