// PhoneInput: telefone com seletor de país (Brasil por padrão) que emite E.164.
// Contrato inalterado: `value` é E.164 (+<país><número>) ou null; `onChange`
// devolve E.164 ou null enquanto incompleto. O backend valida E.164 (telefoneE164).
//
// País padrão = Brasil: quem é do BR só digita o número (nem vê o +55); quem é de
// fora escolhe o país pelo nome e o código entra sozinho (não precisa saber o +XX).
// Guarda país + dígitos em estado LOCAL para não zerar ao apagar abaixo do mínimo:
// emitimos null nesse meio-tempo, mas o que está escrito permanece na tela.
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from 'react'
import { cn } from './cn'
import { Select, type SelectOption } from './Select'
import { PAISES, bandeira, paisPorIso, separarPais, type Pais } from './paises'

type PhoneInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> & {
  /** Valor em E.164 (ex.: +5511999998888) ou null quando vazio. */
  value: string | null
  /** Emite o novo valor em E.164 ou null (sem dígitos suficientes). */
  onChange: (e164: string | null) => void
  /**
   * Opcional: emite os dígitos NACIONAIS crus conforme digitados (mesmo incompletos) e
   * um E.164 PARCIAL (+<país><dígitos>). Serve para buscas por prefixo (ex.: autocomplete
   * de contato a partir do 6º dígito, E15 H15.6), que o `onChange` não cobre por só emitir
   * o número completo ou null.
   */
  onDigitos?: (nacional: string, e164Parcial: string) => void
  invalido?: boolean
}

const OPCOES_PAIS: ReadonlyArray<SelectOption<string>> = PAISES.map((p) => ({
  value: p.iso,
  label: `${bandeira(p.iso)} ${p.nome} (+${p.dial})`,
}))

/** Aplica a máscara visual (11) 99999-8888 (só Brasil). */
function mascararBR(d: string): string {
  const n = d.slice(0, 11)
  if (n.length === 0) return ''
  if (n.length <= 2) return `(${n}`
  if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`
  if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
}

/** Máximo de dígitos nacionais: BR tem 11; os outros respeitam o teto E.164 (15). */
function maxNacional(pais: Pais): number {
  return pais.iso === 'BR' ? 11 : 15 - pais.dial.length
}

/** Monta o E.164, ou null se ainda não dá um número válido. */
function montarE164(pais: Pais, nacional: string): string | null {
  if (pais.iso === 'BR') {
    // celular/fixo BR: 10 ou 11 dígitos nacionais.
    return nacional.length >= 10 ? `+55${nacional}` : null
  }
  const total = pais.dial.length + nacional.length
  return total >= 10 && total <= 15 ? `+${pais.dial}${nacional}` : null
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, onDigitos, className, invalido, ...rest }, ref) => {
    const [iso, setIso] = useState(() => separarPais(value).iso)
    const [digitos, setDigitos] = useState(() => separarPais(value).nacional)
    // Distingue o "eco" do que emitimos de uma mudança externa (reset/perfil).
    const ultimoEmitido = useRef(value)

    useEffect(() => {
      if (value !== ultimoEmitido.current) {
        const p = separarPais(value)
        setIso(p.iso)
        setDigitos(p.nacional)
        ultimoEmitido.current = value
      }
    }, [value])

    const emitir = useCallback(
      (novoIso: string, nacional: string) => {
        const pais = paisPorIso(novoIso)
        const e164 = montarE164(pais, nacional)
        ultimoEmitido.current = e164
        onChange(e164)
        // Dígitos crus + E.164 parcial (mesmo incompleto), para buscas por prefixo.
        onDigitos?.(nacional, `+${pais.dial}${nacional}`)
      },
      [onChange, onDigitos],
    )

    const handleNumero = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const d = e.target.value.replace(/\D/g, '').slice(0, maxNacional(paisPorIso(iso)))
        setDigitos(d)
        emitir(iso, d)
      },
      [iso, emitir],
    )

    const handlePais = useCallback(
      (novoIso: string) => {
        const d = digitos.slice(0, maxNacional(paisPorIso(novoIso)))
        setIso(novoIso)
        setDigitos(d)
        emitir(novoIso, d)
      },
      [digitos, emitir],
    )

    const ehBR = iso === 'BR'
    const visivel = ehBR ? mascararBR(digitos) : digitos
    const pais = paisPorIso(iso)

    return (
      <div className={cn('flex gap-2', className)}>
        <Select
          ariaLabel="País do telefone"
          value={iso}
          onChange={handlePais}
          options={OPCOES_PAIS}
          invalido={invalido}
          // Fechado: só bandeira + código (cabe e não corta); a lista aberta mostra o
          // nome completo, e o nome também aparece no tooltip ao passar o mouse.
          displayLabel={`${bandeira(iso)} +${pais.dial}`}
          title={pais.nome}
          className="w-28 shrink-0 sm:w-32"
        />
        <input
          ref={ref}
          type="tel"
          inputMode="numeric"
          value={visivel}
          onChange={handleNumero}
          aria-invalid={invalido || undefined}
          placeholder={ehBR ? '(11) 99999-8888' : 'número'}
          className={cn(
            'min-w-0 flex-1 rounded-input border bg-cartao px-3 py-2.5 text-sm text-tinta',
            'placeholder:text-tinta-2/60',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia',
            'disabled:cursor-not-allowed disabled:opacity-60',
            invalido ? 'border-barro' : 'border-linha',
          )}
          {...rest}
        />
      </div>
    )
  },
)
PhoneInput.displayName = 'PhoneInput'
