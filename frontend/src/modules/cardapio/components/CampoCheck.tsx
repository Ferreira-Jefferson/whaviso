// Linha de configuracao com checkbox: alvo de toque amplo (min 44px) e destaque quando marcada.
// Substitui o <label><input> solto nos dialogs por um controle com estrutura e estado visivel.
// Primitivo local do modulo cardapio (candidato a promover para @/shared/ui).
import { cn } from '@/shared/ui'

interface Props {
  checked: boolean
  onChange: (valor: boolean) => void
  /** Texto do controle (ex.: "Sugerir no atendimento"). */
  titulo: string
}

export function CampoCheck({ checked, onChange, titulo }: Props) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-input border px-3 py-2.5',
        'text-sm font-medium text-tinta transition-colors',
        checked ? 'border-salvia bg-salvia-claro/40' : 'border-linha hover:bg-papel-2',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 flex-none rounded border-linha text-salvia focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
      />
      {titulo}
    </label>
  )
}
