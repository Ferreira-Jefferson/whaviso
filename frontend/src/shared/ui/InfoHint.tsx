// Ícone de informação com tooltip: explica um campo SEM ocupar uma linha abaixo
// dele (que desalinha grids). Abre no hover e no foco (teclado) e alterna no clique
// (toque). type="button" para nunca submeter o formulário em volta. Acessível:
// botão com aria-label e tooltip ligado por aria-describedby.
//
// O tooltip nasce centralizado no ícone e acima dele, mas se AUTOAJUSTA para nunca
// sair da viewport (essencial no mobile: um label comprido joga o ícone para a direita
// e o tooltip centralizado vazaria a borda em telas estreitas). Na horizontal mede a
// posição real e aplica um deslocamento em px por cima do translate de centralização.
// Na vertical, abre PARA BAIXO quando não cabe acima dentro do contêiner que o recorta
// (ex.: um campo logo abaixo do título num <dialog> com rolagem: acima só há o título,
// e o tooltip opaco o cobriria).
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'

const MARGEM = 8

// Topo (em coords de viewport) do ancestral mais próximo que recorta a rolagem; se não
// houver, o topo da viewport. É o limite acima do qual o tooltip seria cortado/cobriria.
function topoDoContainer(node: HTMLElement): number {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY
    if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') return el.getBoundingClientRect().top
  }
  return 0
}

export function InfoHint({ texto, rotulo }: { texto: string; rotulo?: string }) {
  const id = useId()
  const [aberto, setAberto] = useState(false)
  const [desloc, setDesloc] = useState(0)
  const [abaixo, setAbaixo] = useState(false)
  const tipRef = useRef<HTMLSpanElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (!aberto || !tipRef.current || !btnRef.current) return
    const r = tipRef.current.getBoundingClientRect()
    // posição "natural" (sem o deslocamento já aplicado), para o cálculo ser idempotente.
    const naturalEsq = r.left - desloc
    const naturalDir = r.right - desloc
    const vw = document.documentElement.clientWidth
    let novo = 0
    if (naturalDir > vw - MARGEM) novo = vw - MARGEM - naturalDir
    else if (naturalEsq < MARGEM) novo = MARGEM - naturalEsq
    if (novo !== desloc) setDesloc(novo)
    // vertical: se não couber acima do ícone dentro do contêiner, abre abaixo.
    const topoBtn = btnRef.current.getBoundingClientRect().top
    const cabeAcima = topoBtn - topoDoContainer(tipRef.current) >= r.height + MARGEM
    if (cabeAcima === abaixo) setAbaixo(!cabeAcima)
  }, [aberto, desloc, abaixo, texto])

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={btnRef}
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
          className={`absolute left-1/2 z-20 w-52 max-w-[calc(100vw-1rem)] rounded-lg bg-tinta px-3 py-2 text-xs leading-snug font-normal text-papel shadow-lg ${
            abaixo ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
        >
          {texto}
        </span>
      )}
    </span>
  )
}
