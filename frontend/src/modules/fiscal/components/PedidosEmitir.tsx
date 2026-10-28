// Emissao sob demanda: pedidos concluidos (entregues) que ainda nao tem NFC-e. A loja emite um a
// um ("Emitir NFC-e") ou, com a emissao automatica ligada, todos de uma vez ("Emitir pendentes").
// Se faltar dado fiscal em algum item, a api barra e explica (mensagem ja saneada).
import { FileCheck2, Zap } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Button, Card, MoneyText, Skeleton, useToast } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { PedidoEmissivelDto } from '@/shared/contracts/_generated/fiscal'
import { useEmitirAuto, useEmitirDocumento, useFiscalConfig, usePedidosEmissiveis } from '../api'

export function PedidosEmitir() {
  const config = useFiscalConfig()
  const emissiveis = usePedidosEmissiveis()
  const emitir = useEmitirDocumento()
  const auto = useEmitirAuto()
  const { mostrarToast } = useToast()

  const cfg = config.data
  // Sem emissor ativo nao ha o que emitir: a secao fica fora do caminho.
  if (!cfg?.configurada || !cfg.ativo) return null

  const lista = emissiveis.data ?? []

  async function emitirUm(p: PedidoEmissivelDto) {
    try {
      const doc = await emitir.mutateAsync({ pedido_id: p.pedido_id, tipo: 'nfce' })
      mostrarToast(
        doc.status === 'erro' ? `Pedido ${p.codigo}: ${doc.erro ?? 'não emitido'}` : `NFC-e do pedido ${p.codigo} solicitada.`,
        { tom: doc.status === 'erro' ? 'erro' : 'sucesso' },
      )
    } catch (e) {
      mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível emitir.', { tom: 'erro' })
    }
  }

  async function emitirPendentes() {
    try {
      const r = await auto.mutateAsync()
      mostrarToast(
        `Emissão automática: ${r.emitidos} emitida(s), ${r.pulados} pulada(s), ${r.com_erro} com erro.`,
        { tom: r.com_erro > 0 ? 'info' : 'sucesso' },
      )
    } catch (e) {
      mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível emitir em lote.', { tom: 'erro' })
    }
  }

  if (emissiveis.isPending) return <Skeleton className="mb-4 h-24 w-full" />
  if (lista.length === 0) return null

  return (
    <Card className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileCheck2 strokeWidth={1.75} className="size-5 text-salvia" aria-hidden />
          <h2 className="text-lg text-salvia">Pedidos a emitir</h2>
        </div>
        {cfg.auto_emitir && (
          <Button variante="secondary" loading={auto.isPending} onClick={() => void emitirPendentes()}>
            <Zap strokeWidth={1.75} className="size-4" aria-hidden />
            Emitir pendentes
          </Button>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-linha">
        {lista.map((p) => (
          <li key={p.pedido_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <span className="font-medium text-tinta">{p.codigo}</span>
              <span className="ml-2 text-xs text-tinta-2">{formatarDataHora(p.criado_em)}</span>
            </div>
            <div className="flex items-center gap-3">
              <MoneyText centavos={p.total_centavos} />
              <Button loading={emitir.isPending} onClick={() => void emitirUm(p)}>
                Emitir NFC-e
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
