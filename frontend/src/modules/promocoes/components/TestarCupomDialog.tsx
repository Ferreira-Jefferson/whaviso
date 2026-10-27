// Simulador de cupom: chama POST /promocoes/validar com um codigo e um subtotal e mostra o resultado
// (desconto e total, ou o motivo da recusa). Nao registra uso nem altera nada.
import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, MoneyInput, MoneyText } from '@/shared/ui'
import { useValidarCupom, type ResultadoValidacao } from '../api'
import { ROTULO_MOTIVO } from '../estados'

interface Props {
  aberto: boolean
  aoFechar: () => void
}

export function TestarCupomDialog({ aberto, aoFechar }: Props) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo="Testar cupom" className="max-w-md">
      {aberto && <Formulario aoFechar={aoFechar} />}
    </Dialog>
  )
}

function Formulario({ aoFechar }: { aoFechar: () => void }) {
  const validar = useValidarCupom()
  const [codigo, setCodigo] = useState('')
  const [subtotal, setSubtotal] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoValidacao | null>(null)

  const testar = () => {
    setErro(null)
    setResultado(null)
    if (!codigo.trim() || subtotal == null) {
      setErro('Informe o código e o subtotal do pedido.')
      return
    }
    validar.mutate(
      { codigo: codigo.trim(), subtotal_centavos: subtotal },
      {
        onSuccess: setResultado,
        onError: (e) =>
          setErro(e instanceof ApiError ? e.message : e instanceof Error && e.name === 'ZodError' ? 'Código inválido: 3 a 30 letras, números, _ ou -.' : 'Não foi possível testar o cupom.'),
      },
    )
  }

  return (
    <form
      className="flex flex-col gap-4 text-left"
      onSubmit={(e) => {
        e.preventDefault()
        testar()
      }}
    >
      <Field label="Código do cupom">
        <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={30} className="uppercase" autoFocus />
      </Field>
      <Field label="Subtotal do pedido (sem entrega)">
        <MoneyInput value={subtotal} onChange={setSubtotal} />
      </Field>

      {erro && (
        <p role="alert" className="text-sm text-barro">
          {erro}
        </p>
      )}
      {resultado &&
        (resultado.valido ? (
          <Banner tom="sucesso">
            <span className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 flex-none" aria-hidden />
              <span>
                Cupom válido. Desconto de <MoneyText centavos={resultado.desconto_centavos} />, total de{' '}
                <MoneyText centavos={resultado.total_centavos} /> (sem entrega).
              </span>
            </span>
          </Banner>
        ) : (
          <Banner tom="erro">
            <span className="flex items-start gap-2">
              <XCircle className="mt-0.5 size-4 flex-none" aria-hidden />
              <span>{resultado.motivo ? ROTULO_MOTIVO[resultado.motivo] : 'Cupom não aplicável.'}</span>
            </span>
          </Banner>
        ))}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" loading={validar.isPending}>
          Testar
        </Button>
        <Button type="button" variante="secondary" onClick={aoFechar}>
          Fechar
        </Button>
      </div>
    </form>
  )
}
