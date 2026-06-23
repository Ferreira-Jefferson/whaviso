// ChavePixInput: controle de design system para uma chave Pix (Tipo + chave),
// com detecção do tipo enquanto digita. Presentacional/controlado, como
// PhoneInput/MoneyInput: quem usa cuida do estado e do salvar (não há API aqui).
// A detecção é só auxílio de UX (o backend guarda tipo + chave sem validar um
// contra o outro): sugere o tipo, confirma quando bate, avisa quando diverge e,
// no blur, oferece definir o tipo detectado. Exporta também DicaTipoChave (dica
// passiva), usável sozinha em campos de chave sem seletor de tipo.
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Field } from './Field'
import { Input } from './Input'
import { Select, type SelectOption } from './Select'
import { ROTULO_TIPO_CHAVE } from '../format'
import type { TipoChavePix } from '../contracts'

// --- detecção do tipo (auxílio de UX) ----------------------------------------
// Convenções do Pix (DICT) para desambiguar:
//  - email:     contém @ e parece um e-mail.
//  - aleatoria: chave EVP no formato UUID (8-4-4-4-12 hex).
//  - telefone:  o DICT valida em E.164 (^\+[1-9]\d{1,14}$), NÃO é exclusivo de
//               +55; com o +, qualquer país conta. Sem o +, só inferimos quando
//               vêm 12-13 dígitos começando em 55 (um celular BR sem país tem 11
//               dígitos, IGUAL ao CPF, e aí não dá para saber).
//  - cnpj:      14 dígitos.  cpf: 11 dígitos.
// Quando não há confiança suficiente (incompleto/ambíguo), devolve null.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Adivinha o tipo da chave Pix a partir do texto, ou null se ambíguo/incompleto. */
function detectarTipoChavePix(bruto: string): TipoChavePix | null {
  const v = bruto.trim()
  if (!v) return null

  if (v.includes('@')) return EMAIL.test(v) ? 'email' : null
  if (UUID.test(v)) return 'aleatoria'

  const digitos = v.replace(/\D/g, '')
  if (v.startsWith('+')) {
    return digitos.length >= 8 && digitos.length <= 15 ? 'telefone' : null
  }
  if (digitos.length >= 12 && digitos.length <= 13 && digitos.startsWith('55')) {
    return 'telefone'
  }
  if (digitos.length === 14) return 'cnpj'
  if (digitos.length === 11) return 'cpf'
  return null
}

const OPCOES_TIPO_CHAVE: ReadonlyArray<SelectOption<string>> = [
  { value: '', label: 'Selecione…' },
  { value: 'cpf', label: ROTULO_TIPO_CHAVE.cpf },
  { value: 'cnpj', label: ROTULO_TIPO_CHAVE.cnpj },
  { value: 'email', label: ROTULO_TIPO_CHAVE.email },
  { value: 'telefone', label: ROTULO_TIPO_CHAVE.telefone },
  { value: 'aleatoria', label: ROTULO_TIPO_CHAVE.aleatoria },
]

interface ChavePixInputProps {
  tipo: TipoChavePix | ''
  onTipoChange: (t: TipoChavePix | '') => void
  chave: string
  onChaveChange: (v: string) => void
  erroTipo?: string
  erroChave?: string
  /** Rótulo do campo da chave (padrão "Nova chave Pix"). */
  rotuloChave?: string
  /** 'linha' = Tipo e Chave lado a lado (desktop); 'coluna' = empilhados. */
  orientacao?: 'linha' | 'coluna'
}

export function ChavePixInput({
  tipo,
  onTipoChange,
  chave,
  onChaveChange,
  erroTipo,
  erroChave,
  rotuloChave = 'Nova chave Pix',
  orientacao = 'coluna',
}: ChavePixInputProps) {
  // Vira true no blur quando vale a pena oferecer o tipo detectado.
  const [confirmando, setConfirmando] = useState(false)

  const detectado = detectarTipoChavePix(chave)
  const sugerivel = detectado !== null && detectado !== tipo

  function aoMudarChave(v: string) {
    onChaveChange(v)
    // qualquer edição reabre a chance de confirmar no próximo blur.
    setConfirmando(false)
  }

  function aoSairDaChave() {
    if (sugerivel) setConfirmando(true)
  }

  function aceitar() {
    if (detectado) onTipoChange(detectado)
    setConfirmando(false)
  }

  return (
    <div
      className={
        orientacao === 'linha'
          ? 'flex flex-col gap-3 sm:flex-row sm:items-start'
          : 'flex flex-col gap-3'
      }
    >
      <div className={orientacao === 'linha' ? 'sm:w-40 sm:shrink-0' : undefined}>
        <Field label="Tipo" erro={erroTipo}>
          <Select
            ariaLabel="Tipo da chave Pix"
            value={tipo}
            onChange={(v) => onTipoChange(v as TipoChavePix | '')}
            options={OPCOES_TIPO_CHAVE}
            invalido={Boolean(erroTipo)}
          />
        </Field>
      </div>

      <div className="flex-1">
        <Field label={rotuloChave} erro={erroChave}>
          <Input
            placeholder="CPF, e-mail, telefone ou chave aleatória"
            autoComplete="off"
            value={chave}
            onChange={(e) => aoMudarChave(e.target.value)}
            onBlur={aoSairDaChave}
            invalido={Boolean(erroChave)}
          />
        </Field>

        {/* Confirmação no blur: tem prioridade sobre o feedback passivo. */}
        {confirmando && detectado ? (
          <div className="mt-1.5 flex items-center gap-2 rounded-input border border-linha bg-salvia-claro px-3 py-2 text-xs text-tinta-2">
            <span className="flex-1">
              Isto parece <strong className="text-tinta">{ROTULO_TIPO_CHAVE[detectado]}</strong>.
              {' '}Definir o tipo como {ROTULO_TIPO_CHAVE[detectado]}?
            </span>
            <button
              type="button"
              onClick={aceitar}
              className="inline-flex items-center gap-1 rounded-full bg-salvia px-2.5 py-1 font-medium text-papel"
            >
              <Check strokeWidth={2} className="size-3.5" />
              Sim
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              aria-label="Manter o tipo atual"
              className="rounded-full p-1 text-tinta-2 hover:text-tinta"
            >
              <X strokeWidth={2} className="size-3.5" />
            </button>
          </div>
        ) : (
          <DicaTipoChave chave={chave} tipo={tipo} />
        )}
      </div>
    </div>
  )
}

// Mensagem passiva sob um campo de chave: diz o tipo que parece ser e, quando há
// um tipo escolhido, se bate ou diverge. Usável sozinha (ex.: chave de terceiro
// no "vou pagar", sem seletor de tipo) passando só `chave`.
export function DicaTipoChave({
  chave,
  tipo,
}: {
  chave: string
  tipo?: TipoChavePix | ''
}) {
  const detectado = detectarTipoChavePix(chave)
  if (!detectado) return null

  if (tipo && tipo === detectado) {
    return (
      <p className="mt-1.5 flex items-center gap-1 text-xs text-salvia">
        <Check strokeWidth={2} className="size-3.5" />
        Combina com {ROTULO_TIPO_CHAVE[detectado]}.
      </p>
    )
  }
  if (tipo && tipo !== detectado) {
    return (
      <p className="mt-1.5 text-xs text-barro">
        Isto parece {ROTULO_TIPO_CHAVE[detectado]}, mas o tipo escolhido é outro.
      </p>
    )
  }
  return <p className="mt-1.5 text-xs text-tinta-2">Parece {ROTULO_TIPO_CHAVE[detectado]}.</p>
}
