// Dialog de abertura do caixa: o operador informa o saldo inicial (troco em gaveta).
// Valor em CENTAVOS via MoneyInput. Saldo inicial pode ser zero (abrir sem troco).
import { useEffect, useState } from 'react'
import { Banner, Button, Dialog, Field, MoneyInput } from '@/shared/ui'

interface AbrirCaixaDialogProps {
  aberto: boolean
  carregando: boolean
  erro: string | null
  onConfirmar: (saldoInicialCentavos: number) => void
  onFechar: () => void
}

export function AbrirCaixaDialog({ aberto, carregando, erro, onConfirmar, onFechar }: AbrirCaixaDialogProps) {
  const [saldo, setSaldo] = useState<number | null>(null)

  // Zera o valor sempre que o dialog abre.
  useEffect(() => {
    if (aberto) setSaldo(null)
  }, [aberto])

  function enviar() {
    if (carregando) return
    onConfirmar(saldo ?? 0)
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={carregando ? () => {} : onFechar}
      titulo="Abrir caixa"
      acoes={
        <>
          <Button variante="primary" className="w-full" loading={carregando} onClick={enviar}>
            Abrir caixa
          </Button>
          <Button variante="secondary" className="w-full" disabled={carregando} onClick={onFechar}>
            Cancelar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault()
          enviar()
        }}
      >
        <p className="text-sm text-tinta-2">
          Informe o dinheiro que já está na gaveta no início do turno. Pode ser zero se você abre sem troco.
        </p>

        <Field label="Saldo inicial" dica="Troco em dinheiro na gaveta ao abrir o caixa. Em dinheiro, não inclui cartão nem Pix.">
          <MoneyInput value={saldo} onChange={setSaldo} autoFocus />
        </Field>

        {erro && <Banner tom="erro">{erro}</Banner>}

        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  )
}
