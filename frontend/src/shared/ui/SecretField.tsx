// SecretField: exibe um dado protegido write-only (chave Pix, chave de provedor) como um
// chip com cadeado e os ultimos digitos mascarados. Consolida o padrao de pagamentos
// (PixConfig) e llm (CartaoCredencial). Nunca recebe nem mostra o segredo em claro.
import { Lock } from 'lucide-react'
import { cn } from './cn'

interface SecretFieldProps {
  /** Ultimos 4 digitos/caracteres, quando houver. Sem eles, mostra so "Cadastrada". */
  ultimos4?: string | null
  /** Rotulo curto a direita (ex.: "Protegida"). */
  rotulo?: string
  className?: string
}

export function SecretField({ ultimos4, rotulo = 'Protegida', className }: SecretFieldProps) {
  const mascarado = ultimos4 ? `•••• ${ultimos4}` : 'Cadastrada'
  const aria = ultimos4 ? `Dado protegido, terminado em ${ultimos4}` : 'Dado protegido cadastrado'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-input border border-linha bg-papel-2 px-3 py-2 text-sm',
        className,
      )}
      aria-label={aria}
    >
      <Lock aria-hidden className="size-4 flex-none text-salvia" />
      <span className="tabular text-tinta">{mascarado}</span>
      {rotulo && <span className="ml-auto text-xs text-tinta-2">{rotulo}</span>}
    </span>
  )
}
