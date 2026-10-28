// Campos da config de um node, gerados do JSON Schema que o catalogo do servidor devolve
// (string, boolean, inteiro com limites e lista de opcoes). Propriedade de tipo desconhecido e ignorada.
// Valor vazio remove a chave: o servidor aplica o padrao.
import { Field, Input, cn } from '@/shared/ui'
import { ROTULO_CONFIG, ROTULO_OPCAO } from '../estados'

interface Props {
  esquema: Record<string, unknown>
  valores: Record<string, unknown>
  onMudar: (chave: string, valor: unknown) => void
}

interface Prop {
  type?: string
  minimum?: number
  maximum?: number
  maxLength?: number
  default?: unknown
  items?: { enum?: string[] }
}

export function CampoConfig({ esquema, valores, onMudar }: Props) {
  const props = (esquema.properties ?? {}) as Record<string, Prop>
  const chaves = Object.keys(props)
  if (chaves.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      {chaves.map((chave) => {
        const p = props[chave]
        if (!p) return null
        const rotulo = ROTULO_CONFIG[chave] ?? chave
        const atual = valores[chave]

        if (p.type === 'boolean') {
          const ligado = typeof atual === 'boolean' ? atual : p.default !== false
          return (
            <label key={chave} className="flex min-h-11 items-center gap-3 text-sm text-tinta">
              <input
                type="checkbox"
                checked={ligado}
                onChange={(e) => onMudar(chave, e.target.checked)}
                className="size-4 accent-salvia"
              />
              {rotulo}
            </label>
          )
        }

        if (p.type === 'integer' || p.type === 'number') {
          return (
            <Field key={chave} label={rotulo}>
              <Input
                type="number"
                inputMode="numeric"
                min={p.minimum}
                max={p.maximum}
                value={typeof atual === 'number' ? atual : ''}
                placeholder={p.default !== undefined ? `Padrão: ${String(p.default)}` : undefined}
                onChange={(e) => {
                  const v = e.target.value
                  onMudar(chave, v === '' ? undefined : Math.trunc(Number(v)))
                }}
              />
            </Field>
          )
        }

        if (p.type === 'array' && p.items?.enum) {
          const opcoes = p.items.enum
          const padrao = Array.isArray(p.default) ? (p.default as string[]) : opcoes
          const marcadas = Array.isArray(atual) ? (atual as string[]) : padrao
          return (
            <fieldset key={chave} className="min-w-0">
              <legend className="mb-1 text-sm font-medium text-tinta">{rotulo}</legend>
              <div className="flex flex-wrap gap-1.5">
                {opcoes.map((op) => {
                  const on = marcadas.includes(op)
                  return (
                    <button
                      key={op}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => {
                        const prox = on ? marcadas.filter((m) => m !== op) : [...marcadas, op]
                        // minItems 1: nunca deixa a lista vazia.
                        if (prox.length > 0) onMudar(chave, opcoes.filter((o) => prox.includes(o)))
                      }}
                      className={cn(
                        'inline-flex min-h-11 items-center rounded-pill border px-4 text-sm font-medium transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
                        on ? 'border-salvia bg-salvia text-papel' : 'border-linha bg-cartao text-tinta-2 hover:bg-papel-2',
                      )}
                    >
                      {ROTULO_OPCAO[op] ?? op}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )
        }

        if (p.type === 'string') {
          return (
            <Field key={chave} label={rotulo} dica="Deixe vazio para usar o texto padrão do atendente.">
              <Input
                value={typeof atual === 'string' ? atual : ''}
                maxLength={p.maxLength ?? 500}
                onChange={(e) => onMudar(chave, e.target.value === '' ? undefined : e.target.value)}
              />
            </Field>
          )
        }
        return null
      })}
    </div>
  )
}
