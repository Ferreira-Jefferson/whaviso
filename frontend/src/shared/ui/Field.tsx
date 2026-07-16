import { useId, type ReactNode } from 'react'
import { cloneElement, isValidElement } from 'react'
import { InfoHint } from './InfoHint'

interface FieldProps {
  label: string
  /** Mensagem de erro amigável (de react-hook-form/zod). */
  erro?: string
  /**
   * Explicação do campo. Sempre mostrada num ícone (?) ao lado do label (tooltip do
   * InfoHint), nunca como texto abaixo do campo: assim não desalinha grids nem polui a tela.
   */
  dica?: string
  /** O controle (Input/Textarea/etc.). Recebe id/aria automaticamente. */
  children: ReactNode
}

// Envolve um controle com label, dica e mensagem de erro, ligando os ids
// para acessibilidade. Compatível com react-hook-form (o controle recebe
// register() via spread no children). A `dica` vira sempre o ícone (?) ao lado do label.
export function Field({ label, erro, dica, children }: FieldProps) {
  const id = useId()
  const erroId = `${id}-erro`

  const controle = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        invalido: Boolean(erro) || undefined,
        'aria-describedby': erro ? erroId : undefined,
      })
    : children

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-tinta">
        {label}
        {dica && <InfoHint texto={dica} rotulo={`Sobre: ${label}`} />}
      </label>
      {controle}
      {erro && (
        <p id={erroId} className="text-xs text-barro" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}
