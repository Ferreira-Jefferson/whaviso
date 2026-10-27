// Mostra o BR Code (Pix copia e cola) de uma cobranca para o dono copiar. O texto so existe em
// memoria enquanto o dialog esta aberto: nao e logado, nao vai para URL nem storage.
import { useState } from 'react'
import { Check, Copy, Info } from 'lucide-react'
import { Badge, Button, Dialog, MoneyText, useToast } from '@/shared/ui'
import type { PagamentoSaida } from '@/shared/contracts/_generated/pagamentos'
import { ROTULO_STATUS, TOM_STATUS, refPedido } from '../estados'

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
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-input border border-linha bg-papel-2 px-4 py-3">
            <div className="flex flex-col">
              <span className="text-xs text-tinta-2">Valor da cobrança</span>
              <MoneyText centavos={pagamento.valor_centavos} className="text-xl text-tinta" />
            </div>
            <Badge tom={TOM_STATUS[pagamento.status]}>{ROTULO_STATUS[pagamento.status]}</Badge>
          </div>

          {codigo ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-tinta-2">Pix copia e cola</span>
              <textarea
                readOnly
                rows={5}
                value={codigo}
                aria-label="Código Pix copia e cola"
                onFocus={(e) => e.currentTarget.select()}
                className="w-full resize-none break-all rounded-input border border-linha bg-papel-2 p-3 font-mono text-xs text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
              />
              <p className="text-xs text-tinta-2">Envie este código para o cliente pagar pelo app do banco.</p>
            </div>
          ) : (
            <p className="text-sm text-tinta-2">Esta cobrança não tem código Pix disponível.</p>
          )}

          {pagamento.status !== 'pendente' && (
            <p className="flex items-start gap-2 rounded-input border border-linha bg-papel-2 px-3 py-2 text-xs text-tinta-2">
              <Info strokeWidth={1.75} className="mt-0.5 size-4 flex-none" aria-hidden />
              Esta cobrança não está mais aguardando pagamento.
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}
