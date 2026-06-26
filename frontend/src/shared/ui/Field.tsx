import { useId, type ReactNode } from 'react'
import { cloneElement, isValidElement } from 'react'
import { InfoHint } from './InfoHint'

interface FieldProps {
  label: string
  /** Mensagem de erro amigável (de react-hook-form/zod). */
  erro?: string
  /** Dica curta abaixo do label. */
  dica?: string
  /**
   * Mostra a `dica` num ícone de info ao lado do label (tooltip), em vez de texto
   * abaixo do campo. Use em grids onde a linha de dica desalinha as colunas.
   */
  dicaComoIcone?: boolean
  /** O controle (Input/Textarea/etc.). Recebe id/aria automaticamente. */
  children: ReactNode
}

// Envolve um controle com label, dica e mensagem de erro, ligando os ids
// para acessibilidade. Compatível com react-hook-form (o controle recebe
// register() via spread no children).
export function Field({ label, erro, dica, dicaComoIcone, children }: FieldProps) {
  const id = useId()
  const erroId = `${id}-erro`
  const dicaId = `${id}-dica`
  // Dica em ícone não vira um <p> abaixo: o tooltip do InfoHint tem o próprio id.
  const dicaAbaixo = Boolean(dica) && !dicaComoIcone

  const descritores = [erro ? erroId : null, dicaAbaixo ? dicaId : null]
    .filter(Boolean)
    .join(' ')

  const controle = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        invalido: Boolean(erro) || undefined,
        'aria-describedby': descritores || undefined,
      })
    : children

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-tinta">
        {label}
        {dica && dicaComoIcone && <InfoHint texto={dica} rotulo={`Sobre: ${label}`} />}
      </label>
      {dicaAbaixo && (
        <p id={dicaId} className="text-xs text-tinta-2">
          {dica}
        </p>
      )}
      {controle}
      {erro && (
        <p id={erroId} className="text-xs text-barro" role="alert">
          {erro}
        </p>
      )}
    </div>
  )
}
