// Mostra o BR Code (Pix copia e cola) de uma cobranca para o dono copiar. O texto so existe em
// memoria enquanto o dialog esta aberto: nao e logado, nao vai para URL nem storage.
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, Dialog, MoneyText, useToast } from '@/shared/ui'
import type { PagamentoSaida } from '@/shared/contracts/_generated/pagamentos'
import { refPedido } from '../estados'

interface Props {
  pagamento: PagamentoSaida | null
  onFechar: () => void
}

export function BrCodeDialog({ pagamento, onFechar }: Props) {
  const { mostrarToast } = useToast()
  const [copiado, setCopiado] = useState(false)
  const codigo = pagamento?.br_code ?? null

  async function copiar() {
    if (!codigo) return
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      mostrarToast('Código Pix copiado.', { tom: 'sucesso' })
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      mostrarToast('Não foi possível copiar. Selecione o texto e copie manualmente.', { tom: 'erro' })
    }
  }

  function fechar() {
    setCopiado(false)
    onFechar()
  }

  return (
    <Dialog
      aberto={pagamento !== null}
      onFechar={fechar}
      titulo={pagamento ? `Pix do pedido ${refPedido(pagamento.pedido_id)}` : 'Pix'}
      className="max-w-md"
      acoes={
        <>
          {codigo && (
            <Button className="w-full" onClick={() => void copiar()}>
              {copiado ? (
                <Check strokeWidth={2} className="size-4" aria-hidden />
              ) : (
                <Copy strokeWidth={1.75} className="size-4" aria-hidden />
              )}
              {copiado ? 'Copiado' : 'Copiar código'}
            </Button>
          )}
          <Button variante="secondary" className="w-full" onClick={fechar}>
            Fechar
          </Button>
        </>
      }
    >
      {pagamento && (
        <div className="flex flex-col gap-3">
          <p>
            Valor: <MoneyText centavos={pagamento.valor_centavos} className="font-medium text-tinta" />
          </p>
          {codigo ? (
            <textarea
              readOnly
              rows={5}
              value={codigo}
              aria-label="Código Pix copia e cola"
              onFocus={(e) => e.currentTarget.select()}
              className="w-full resize-none break-all rounded-input border border-linha bg-papel-2 p-3 font-mono text-xs text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
            />
          ) : (
            <p>Esta cobrança não tem código Pix disponível.</p>
          )}
          {pagamento.status !== 'pendente' && (
            <p className="text-xs">Esta cobrança não está mais aguardando pagamento.</p>
          )}
        </div>
      )}
    </Dialog>
  )
}
