// DateInput: data de NEGÓCIO pura (YYYY-MM-DD), interpretada em America/Sao_Paulo
// pelo backend. Nunca calcula etapa/fuso no cliente (plano risco nº 4): o valor é
// sempre a string "YYYY-MM-DD" e a aritmética de calendário aqui é só de exibição.
//
// Calendário PRÓPRIO (design system "Calmo Editorial"), não o popup nativo do
// navegador (que não dá para estilizar). Continua sendo um drop-in do antigo
// <input type="date">: um <input> escondido segura o valor de verdade e recebe
// `ref`/`name`/`onChange`; o popover só escreve nesse input. Suporta uso controlado
// (`value`+`onChange`) e não controlado (`defaultValue`).
//
// Com react-hook-form, prefira `Controller` (modo CONTROLADO), não `register`: o
// calendário escreve o valor e a exibição vem do `value`, mantendo tudo em sincronia.
import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from './cn'

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  invalido?: boolean
}

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const

const pad = (n: number) => String(n).padStart(2, '0')
const paraIso = (ano: number, mes1a12: number, dia: number) =>
  `${ano}-${pad(mes1a12)}-${pad(dia)}`

// 'YYYY-MM-DD' -> Date LOCAL ao meio-dia (evita o escorregão de fuso do new Date(iso),
// que parseia em UTC). Só para navegar o calendário; o valor trafegado é a string.
function isoParaPartes(iso: string | undefined): { ano: number; mes: number; dia: number } | null {
  if (!iso) return null
  const [a, m, d] = iso.split('-').map(Number)
  if (!a || !m || !d) return null
  return { ano: a, mes: m, dia: d }
}

// Hoje LOCAL como 'YYYY-MM-DD'. Só para destacar "hoje" e definir o mês inicial; a
// regra de fuso de negócio é do backend (o `min` de "a partir de hoje" vem do pai).
function hojeLocalIso(): string {
  const d = new Date()
  return paraIso(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

// Dia em que o calendário abre quando ainda não há valor: o 1º SELECIONÁVEL, não "hoje".
// Se o `min` é futuro (ex.: a Data combinada), abrir em "hoje" mostraria um mês todo
// desabilitado; então abre no mês do `min`. Sem min (ou min no passado), abre em hoje.
function isoInicial(valorAtual: string, min0: string | undefined, hoje: string): string {
  if (valorAtual) return valorAtual
  return min0 && min0 > hoje ? min0 : hoje
}

interface Celula {
  iso: string
  dia: number
  mesAtual: boolean
  hoje: boolean
  selecionado: boolean
  desabilitado: boolean
}

// 42 células (6 semanas) começando no domingo da semana do dia 1; dias de fora do mês
// vêm esmaecidos. `new Date(ano, mes-1, 1 - offset + i)` normaliza a virada de mês.
function gerarCelulas(
  ano: number,
  mes1a12: number,
  selecionado: string | undefined,
  min: string | undefined,
  hoje: string,
): Celula[] {
  const offset = new Date(ano, mes1a12 - 1, 1).getDay()
  return Array.from({ length: 42 }, (_, i) => {
    const dt = new Date(ano, mes1a12 - 1, 1 - offset + i)
    const iso = paraIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
    return {
      iso,
      dia: dt.getDate(),
      mesAtual: dt.getMonth() + 1 === mes1a12,
      hoje: iso === hoje,
      selecionado: iso === selecionado,
      // ISO zero-paddeado ordena lexicograficamente: iso < min => antes do mínimo.
      desabilitado: Boolean(min) && iso < min!,
    }
  })
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(
  ({ className, invalido, value, defaultValue, onChange, min, disabled, ...rest }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null)
    const gatilhoRef = useRef<HTMLButtonElement>(null)
    const popoverRef = useRef<HTMLDivElement>(null)

    // ref encaminhado (RHF) + ref interno: precisamos do nó para escrever o valor.
    const setRefs = useCallback(
      (no: HTMLInputElement | null) => {
        inputRef.current = no
        if (typeof ref === 'function') ref(no)
        else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = no
      },
      [ref],
    )

    const controlado = value !== undefined
    const [valorInterno, setValorInterno] = useState<string>(
      (value as string) ?? (defaultValue as string) ?? '',
    )
    const valorAtual = controlado ? ((value as string) ?? '') : valorInterno
    const min0 = typeof min === 'string' && min ? min : undefined
    const hoje = useMemo(() => hojeLocalIso(), [])

    const [aberto, setAberto] = useState(false)
    const [mesVisivel, setMesVisivel] = useState(() => {
      const p = isoParaPartes(isoInicial(valorAtual, min0, hoje))!
      return { ano: p.ano, mes: p.mes }
    })

    // Dia "ativo" para a navegação por teclado (tabindex rotativo).
    const [ativo, setAtivo] = useState<string>(() => isoInicial(valorAtual, min0, hoje))
    const focoPendente = useRef<string | null>(null)

    const celulas = useMemo(
      () => gerarCelulas(mesVisivel.ano, mesVisivel.mes, valorAtual || undefined, min0, hoje),
      [mesVisivel, valorAtual, min0, hoje],
    )

    // Notifica o pai com um evento nativo de verdade: escreve no <input> via setter do
    // protótipo (driblando o rastreador de valor do React) e dispara 'input'. Isso
    // aciona o onChange do próprio <input> abaixo, que é o ÚNICO caminho que atualiza o
    // estado interno e repassa o evento ao pai (RHF e onChange controlado leem
    // e.target.value). Sem nó (não deveria ocorrer), repassa um evento sintético.
    const emitir = useCallback(
      (iso: string) => {
        const no = inputRef.current
        if (no) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          )?.set
          setter?.call(no, iso)
          no.dispatchEvent(new Event('input', { bubbles: true }))
          return
        }
        if (!controlado) setValorInterno(iso)
        onChange?.({ target: { value: iso } } as React.ChangeEvent<HTMLInputElement>)
      },
      [controlado, onChange],
    )

    function abrir() {
      if (disabled) return
      const ini = isoInicial(valorAtual, min0, hoje)
      const p = isoParaPartes(ini)!
      setMesVisivel({ ano: p.ano, mes: p.mes })
      setAtivo(ini)
      setAberto(true)
    }
    const fechar = useCallback((devolverFoco = true) => {
      setAberto(false)
      if (devolverFoco) gatilhoRef.current?.focus()
    }, [])

    function selecionar(iso: string) {
      emitir(iso)
      fechar()
    }

    function irMes(delta: number) {
      const dt = new Date(mesVisivel.ano, mesVisivel.mes - 1 + delta, 1)
      const novo = { ano: dt.getFullYear(), mes: dt.getMonth() + 1 }
      setMesVisivel(novo)
      // Mantém um dia tabulável (tabindex rotativo) ao trocar de mês pelos chevrons.
      setAtivo(paraIso(novo.ano, novo.mes, 1))
    }

    // Navegação por setas: move o dia ativo; ao cruzar a borda do mês, troca o mês e
    // refoca o novo dia depois do render.
    function aoTeclar(e: React.KeyboardEvent) {
      const passo: Record<string, number> = {
        ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
      }
      if (e.key in passo) {
        e.preventDefault()
        const p = isoParaPartes(ativo)!
        const dt = new Date(p.ano, p.mes - 1, p.dia + passo[e.key]!)
        const iso = paraIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
        if (min0 && iso < min0) return
        focoPendente.current = iso
        setAtivo(iso)
        setMesVisivel({ ano: dt.getFullYear(), mes: dt.getMonth() + 1 })
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (!(min0 && ativo < min0)) selecionar(ativo)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        fechar()
      }
    }

    // Foca o dia ativo após uma navegação que trocou o mês.
    useLayoutEffect(() => {
      if (!aberto || !focoPendente.current) return
      const alvo = popoverRef.current?.querySelector<HTMLButtonElement>(
        `[data-iso="${focoPendente.current}"]`,
      )
      alvo?.focus()
      focoPendente.current = null
    })

    // Fecha ao clicar fora (gatilho + popover) ou rolar para longe.
    useEffect(() => {
      if (!aberto) return
      function aoClicarFora(e: MouseEvent) {
        const alvo = e.target as Node
        if (gatilhoRef.current?.contains(alvo) || popoverRef.current?.contains(alvo)) return
        setAberto(false)
      }
      document.addEventListener('mousedown', aoClicarFora)
      return () => document.removeEventListener('mousedown', aoClicarFora)
    }, [aberto])

    // Posiciona o popover (portal) ancorado no gatilho; reposiciona em scroll/resize.
    const [coords, setCoords] = useState<{ top: number; left: number; width: number }>()
    useLayoutEffect(() => {
      if (!aberto) return
      function posicionar() {
        const g = gatilhoRef.current
        if (!g) return
        const r = g.getBoundingClientRect()
        const larguraPopover = 288
        const altura = 340
        const abreParaCima = r.bottom + altura > window.innerHeight && r.top > altura
        const left = Math.min(r.left, window.innerWidth - larguraPopover - 8)
        setCoords({
          top: abreParaCima ? r.top - altura - 6 : r.bottom + 6,
          left: Math.max(8, left),
          width: r.width,
        })
      }
      posicionar()
      window.addEventListener('scroll', posicionar, true)
      window.addEventListener('resize', posicionar)
      return () => {
        window.removeEventListener('scroll', posicionar, true)
        window.removeEventListener('resize', posicionar)
      }
    }, [aberto])

    const partesValor = isoParaPartes(valorAtual)
    const rotuloValor = partesValor
      ? `${pad(partesValor.dia)}/${pad(partesValor.mes)}/${partesValor.ano}`
      : null

    return (
      <>
        {/* Valor de verdade: escondido, mas no DOM (ref/name/onChange do register). */}
        <input
          ref={setRefs}
          type="date"
          value={value as string | undefined}
          defaultValue={defaultValue as string | undefined}
          min={min}
          disabled={disabled}
          onChange={(e) => {
            if (!controlado) setValorInterno(e.target.value)
            onChange?.(e)
          }}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          {...rest}
        />

        {/* Gatilho: parece o Input antigo; abre o calendário do design system. */}
        <button
          ref={gatilhoRef}
          type="button"
          disabled={disabled}
          onClick={() => (aberto ? fechar(false) : abrir())}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          aria-invalid={invalido || undefined}
          aria-label={(rest['aria-label'] as string) ?? undefined}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-input border bg-cartao px-3 py-2.5 text-sm',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
            'disabled:cursor-not-allowed disabled:opacity-60',
            invalido ? 'border-barro' : 'border-linha',
            className,
          )}
        >
          <span className={rotuloValor ? 'text-tinta' : 'text-tinta-2'}>
            {rotuloValor ?? 'dd/mm/aaaa'}
          </span>
          <CalendarDays strokeWidth={1.75} aria-hidden className="size-4 shrink-0 text-tinta-2" />
        </button>

        {aberto &&
          coords &&
          createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label="Escolher data"
              style={{ top: coords.top, left: coords.left, width: 288 }}
              className="fixed z-50 rounded-card border border-linha bg-cartao p-3 text-tinta shadow-[0_12px_40px_rgba(32,50,42,0.18)]"
            >
              {/* Cabeçalho: mês/ano + navegação. */}
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => irMes(-1)}
                  aria-label="Mês anterior"
                  className="rounded-input p-1.5 text-tinta-2 transition-colors hover:bg-papel-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                >
                  <ChevronLeft strokeWidth={1.75} className="size-4" />
                </button>
                <span className="font-display text-sm font-semibold capitalize text-salvia">
                  {MESES[mesVisivel.mes - 1]} de {mesVisivel.ano}
                </span>
                <button
                  type="button"
                  onClick={() => irMes(1)}
                  aria-label="Próximo mês"
                  className="rounded-input p-1.5 text-tinta-2 transition-colors hover:bg-papel-2 hover:text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                >
                  <ChevronRight strokeWidth={1.75} className="size-4" />
                </button>
              </div>

              {/* Cabeçalho dos dias da semana (D S T Q Q S S). */}
              <div className="grid grid-cols-7 gap-0.5 pb-1">
                {DIAS_SEMANA.map((d, i) => (
                  <span key={i} className="py-1 text-center text-[11px] font-medium text-tinta-2">
                    {d}
                  </span>
                ))}
              </div>

              {/* Grade de dias. */}
              <div className="grid grid-cols-7 gap-0.5" role="grid" onKeyDown={aoTeclar}>
                {celulas.map((c) => (
                  <button
                    key={c.iso}
                    type="button"
                    data-iso={c.iso}
                    disabled={c.desabilitado}
                    tabIndex={c.iso === ativo ? 0 : -1}
                    aria-current={c.hoje ? 'date' : undefined}
                    aria-pressed={c.selecionado}
                    onClick={() => selecionar(c.iso)}
                    onFocus={() => setAtivo(c.iso)}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-input text-sm transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
                      'disabled:cursor-not-allowed disabled:opacity-30',
                      // Cor do texto: UMA escolha só (cn não faz merge do Tailwind, então
                      // dois `text-*` brigariam e o número some no fundo salvia).
                      c.selecionado
                        ? 'text-papel'
                        : !c.mesAtual
                          ? 'text-tinta-2/60'
                          : c.hoje
                            ? 'text-salvia'
                            : 'text-tinta',
                      (c.selecionado || c.hoje) && 'font-semibold',
                      c.selecionado ? 'bg-salvia hover:bg-salvia' : 'hover:bg-salvia-claro',
                      !c.selecionado && c.hoje && 'ring-1 ring-inset ring-salvia/40',
                    )}
                  >
                    {c.dia}
                  </button>
                ))}
              </div>

              {/* Rodapé: limpar / hoje (paridade com o nativo). */}
              <div className="mt-2 flex items-center justify-between border-t border-linha pt-2 text-sm">
                <button
                  type="button"
                  onClick={() => selecionar('')}
                  className="rounded-input px-2 py-1 text-tinta-2 transition-colors hover:text-barro focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  disabled={Boolean(min0) && hoje < min0!}
                  onClick={() => selecionar(hoje)}
                  className="rounded-input px-2 py-1 font-medium text-salvia transition-colors hover:bg-salvia-claro disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                >
                  Hoje
                </button>
              </div>
            </div>,
            document.body,
          )}
      </>
    )
  },
)
DateInput.displayName = 'DateInput'
