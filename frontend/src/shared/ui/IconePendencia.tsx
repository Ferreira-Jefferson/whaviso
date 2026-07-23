// IconePendencia: ícone puro para sinalizar uma pendência num item de lista/detalhe (ex.:
// falta chave Pix, falta aprovação). SEM lógica de negócio embutida: quem consome escolhe
// o `tipo` (tom visual) e o `tooltip` (o texto explicativo); este componente só desenha.
// Feito para os grupos 1B (painel) e 1C (detalhe) importarem sem coordenação direta com
// quem o criou, por isso a interface abaixo é o contrato e deve ficar estável.
//
// Props:
//  - `tipo` (TipoIconePendencia): tom visual do ícone. Não carrega significado de negócio;
//    quem consome mapeia sua própria pendência para um destes tons:
//      - 'bloqueio': impede uma ação (ex.: envio bloqueado sem Pix). Tom mais forte.
//      - 'aviso': chama atenção mas não impede nada (ex.: dado opcional faltando).
//      - 'info': neutro, só informativo.
//  - `tooltip` (string): texto explicativo mostrado ao passar o mouse/focar/tocar. A
//    redação (o que está pendente, o que fazer) é responsabilidade de quem consome.
//  - `className` (opcional): classes extra no ícone (ex.: ajuste de tamanho).
//
// Tooltip acessível (mesmo padrão do InfoHint): abre no hover e no foco (teclado), alterna
// no clique/toque, e se autoajusta na horizontal para nunca vazar a viewport.
import { useId, useLayoutEffect, useRef, useState } from 'react'
import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { cn } from './cn'

export type TipoIconePendencia = 'bloqueio' | 'aviso' | 'info'

export interface IconePendenciaProps {
  tipo: TipoIconePendencia
  tooltip: string
  className?: string
}

const ESTILO: Record<TipoIconePendencia, { Icone: typeof CircleAlert; cor: string }> = {
  bloqueio: { Icone: CircleAlert, cor: 'text-barro' },
  aviso: { Icone: TriangleAlert, cor: 'text-ambar' },
  info: { Icone: Info, cor: 'text-tinta-2' },
}

const MARGEM = 8

export function IconePendencia({ tipo, tooltip, className }: IconePendenciaProps) {
  const id = useId()
  const [aberto, setAberto] = useState(false)
  const [desloc, setDesloc] = useState(0)
  const tipRef = useRef<HTMLSpanElement>(null)
  const { Icone, cor } = ESTILO[tipo]

  useLayoutEffect(() => {
    if (!aberto || !tipRef.current) return
    const r = tipRef.current.getBoundingClientRect()
    const naturalEsq = r.left - desloc
    const naturalDir = r.right - desloc
    const vw = document.documentElement.clientWidth
    let novo = 0
    if (naturalDir > vw - MARGEM) novo = vw - MARGEM - naturalDir
    else if (naturalEsq < MARGEM) novo = MARGEM - naturalEsq
    if (novo !== desloc) setDesloc(novo)
  }, [aberto, desloc, tooltip])

  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={tooltip}
        aria-describedby={aberto ? id : undefined}
        className={cn(
          'rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
          cor,
        )}
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onClick={(e) => {
          e.preventDefault()
          setAberto((v) => !v)
        }}
      >
        <Icone strokeWidth={1.75} className={cn('size-3.5', className)} />
      </button>
      {aberto && (
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${desloc}px))` }}
          className="absolute bottom-full left-1/2 z-20 mb-2 w-52 max-w-[calc(100vw-1rem)] rounded-lg bg-tinta px-3 py-2 text-xs leading-snug font-normal text-papel shadow-lg"
        >
          {tooltip}
        </span>
      )}
    </span>
  )
}
