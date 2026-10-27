// Canais externos de pedidos (/canais): conectar iFood e outros (credencial write-only),
// sincronizar e ver os pedidos ja importados. O provedor real pode ainda nao estar integrado:
// nesse caso a sincronizacao avisa em vez de falhar.
import { useState } from 'react'
import { Inbox } from 'lucide-react'
import {
  Badge,
  Banner,
  EmptyState,
  ErrorState,
  MoneyText,
  PageHeader,
  Skeleton,
  TableResponsive,
  type ColunaTabela,
} from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { usePedidosDosCanais, useCanais } from '../api'
import { CANAIS } from '../estados'
import { CardCanal } from '../components/CardCanal'
import { ConectarCanalDialog } from '../components/ConectarCanalDialog'

type PedidoCanal = NonNullable<ReturnType<typeof usePedidosDosCanais>['data']>[number]

const COLUNAS: ColunaTabela<PedidoCanal>[] = [
  { chave: 'codigo', titulo: 'Pedido', principal: true, render: (p) => <span className="font-medium text-tinta">{p.codigo}</span> },
  { chave: 'externo', titulo: 'Código no canal', render: (p) => <span className="tabular">{p.id_externo}</span> },
  { chave: 'total', titulo: 'Total', alinhar: 'direita', render: (p) => <MoneyText centavos={p.total_centavos} /> },
  { chave: 'quando', titulo: 'Recebido em', render: (p) => formatarDataHora(p.criado_em) },
]

export default function Canais() {
  const [conectando, setConectando] = useState<(typeof CANAIS)[number] | null>(null)
  const canais = useCanais()
  const pedidos = usePedidosDosCanais()

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Canais de pedidos"
        descricao="Traga os pedidos do iFood e de outros canais para o mesmo painel."
      />

      <Banner tom="info" className="mb-5">
        A integração com cada canal está sendo liberada aos poucos. Você já pode guardar a credencial; quando o canal estiver
        disponível, a sincronização passa a funcionar sem novo cadastro.
      </Banner>

      {canais.isPending && (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Carregando canais">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-4 rounded-card border border-linha bg-cartao p-5">
              <div className="flex items-start gap-3">
                <Skeleton className="size-10 flex-none rounded-full" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-44" />
                </div>
              </div>
              <Skeleton className="h-px w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      )}
      {canais.isError && <ErrorState aoTentarDeNovo={() => void canais.refetch()} />}
      {canais.isSuccess && (
        <div className="grid gap-4 md:grid-cols-2">
          {CANAIS.map((info) => (
            <CardCanal
              key={info.canal}
              info={info}
              estado={canais.data.find((c) => c.canal === info.canal)}
              aoConectar={() => setConectando(info)}
            />
          ))}
        </div>
      )}

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-linha pb-2">
          <h2 className="text-lg text-salvia">Pedidos importados</h2>
          {pedidos.isSuccess && pedidos.data.length > 0 && <Badge tom="neutro">{pedidos.data.length}</Badge>}
        </div>
        {pedidos.isPending && <Skeleton className="h-24 w-full" />}
        {pedidos.isError && <ErrorState aoTentarDeNovo={() => void pedidos.refetch()} />}
        {pedidos.isSuccess && pedidos.data.length === 0 && (
          <EmptyState
            icone={<Inbox className="size-7" aria-hidden />}
            titulo="Nenhum pedido importado"
            descricao="Os pedidos dos canais conectados aparecem aqui depois da sincronização."
          />
        )}
        {pedidos.isSuccess && pedidos.data.length > 0 && (
          <TableResponsive
            legenda="Pedidos importados dos canais"
            colunas={COLUNAS}
            linhas={pedidos.data}
            chaveLinha={(p) => `${p.id_externo}`}
          />
        )}
      </section>

      <ConectarCanalDialog
        canal={conectando}
        atual={conectando ? canais.data?.find((c) => c.canal === conectando.canal) : undefined}
        onFechar={() => setConectando(null)}
      />
    </div>
  )
}
