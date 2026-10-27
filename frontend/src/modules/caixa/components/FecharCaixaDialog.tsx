// Dialog de fechamento do caixa: o operador conta o dinheiro da gaveta e informa o saldo.
// Enquanto digita, mostramos a DIFERENCA prevista (informado - esperado em dinheiro), so como
// apresentacao; o calculo oficial (saldo_calculado/diferenca) vem do servidor na resposta.
// Valor em CENTAVOS. `saldoEsperadoCentavos` vem do relatorio da sessao.
import { useEffect, useState } from 'react'
import { Banner, Button, Dialog, Field, Input, MoneyInput, MoneyText } from '@/shared/ui'
import { cn } from '@/shared/ui'
import { formatarCentavos } from '@/shared/format'
import { ROTULO_DIFERENCA, tomDaDiferenca, type TomDiferenca } from '../estados'

interface FecharCaixaDialogProps {
  aberto: boolean
  carregando: boolean
  erro: string | null
  /** Dinheiro esperado na gaveta (saldo_esperado_dinheiro_centavos do relatorio). */
  saldoEsperadoCentavos: number
  onConfirmar: (dados: { saldoInformadoCentavos: number; observacoes?: string }) => void
  onFechar: () => void
}

const COR_DIFERENCA: Record<TomDiferenca, string> = {
  exato: 'text-folha',
  sobra: 'text-ambar',
  falta: 'text-barro',
}

/** Fundo/borda suave do box de diferenca, reforcando o sinal (nunca so pela cor: leva texto). */
const FUNDO_DIFERENCA: Record<TomDiferenca, string> = {
  exato: 'border-folha/30 bg-salvia-claro/40',
  sobra: 'border-ambar/30 bg-ambar-claro/60',
  falta: 'border-barro/30 bg-barro/5',
}

export function FecharCaixaDialog({
  aberto,
  carregando,
  erro,
  saldoEsperadoCentavos,
  onConfirmar,
  onFechar,
}: FecharCaixaDialogProps) {
  const [saldo, setSaldo] = useState<number | null>(null)
  const [observacoes, setObservacoes] = useState('')

  useEffect(() => {
    if (aberto) {
      setSaldo(null)
      setObservacoes('')
    }
  }, [aberto])

  const informado = saldo ?? 0
  const diferenca = informado - saldoEsperadoCentavos
  const tom = tomDaDiferenca(diferenca)
  const mostrarDiferenca = saldo != null

  const podeEnviar = saldo != null && !carregando

  function enviar() {
    if (!podeEnviar) return
    const obs = observacoes.trim()
    onConfirmar({ saldoInformadoCentavos: saldo, observacoes: obs.length > 0 ? obs : undefined })
  }

  return (
    <Dialog
      aberto={aberto}
      onFechar={carregando ? () => {} : onFechar}
      titulo="Fechar caixa"
      acoes={
        <>
          <Button variante="primary" className="w-full" loading={carregando} disabled={!podeEnviar} onClick={enviar}>
            Fechar caixa
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
          Conte o dinheiro da gaveta e informe o total. Vamos comparar com o esperado para registrar a diferença.
        </p>

        <div className="flex items-center justify-between gap-2 rounded-input border border-linha bg-papel-2 px-3 py-2.5">
          <span className="text-sm text-tinta-2">Esperado em dinheiro</span>
          <MoneyText centavos={saldoEsperadoCentavos} className="text-sm font-medium text-tinta" />
        </div>

        <Field label="Saldo conferido" dica="Total de dinheiro contado na gaveta ao fechar. Em dinheiro, não inclui cartão nem Pix.">
          <MoneyInput value={saldo} onChange={setSaldo} autoFocus />
        </Field>

        {mostrarDiferenca && (
          <div className={cn('flex flex-col gap-1 rounded-input border px-3 py-2.5', FUNDO_DIFERENCA[tom])}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-tinta-2">Diferença prevista</span>
              <span className={cn('text-base font-semibold tabular', COR_DIFERENCA[tom])}>
                {diferenca > 0 ? '+' : ''}
                {formatarCentavos(diferenca)}
              </span>
            </div>
            <span className="text-xs text-tinta-2">{ROTULO_DIFERENCA[tom]}</span>
          </div>
        )}

        <Field label="Observações (opcional)" dica="Anotação sobre o fechamento, útil quando o valor não bate.">
          <Input
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Ex.: faltou troco no meio do turno"
            maxLength={500}
            autoComplete="off"
          />
        </Field>

        {erro && <Banner tom="erro">{erro}</Banner>}

        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  )
}
