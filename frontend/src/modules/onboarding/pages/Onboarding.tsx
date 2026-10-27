// Onboarding da loja ativa (/onboarding): checklist de configuracao e o tempo ate o primeiro pedido.
// Tudo vem pronto do servidor (GET /v1/onboarding); a tela so apresenta.
import { Timer } from 'lucide-react'
import { Badge, Card, ErrorState, PageHeader, Skeleton } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import { useOnboarding } from '../api'
import { ChecklistOnboarding } from '../components/ChecklistOnboarding'
import { formatarDuracao } from '../estados'

export default function Onboarding() {
  const consulta = useOnboarding()

  return (
    <div>
      <PageHeader
        titulo="Primeiros passos"
        descricao="Acompanhe o que falta para sua loja começar a receber pedidos."
        acoes={consulta.data?.completo ? <Badge tom="sucesso">Configuração completa</Badge> : undefined}
      />

      {consulta.isPending && (
        <div aria-busy="true" aria-label="Carregando onboarding" className="grid gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {consulta.isError && <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />}
      {consulta.isSuccess && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ChecklistOnboarding dados={consulta.data} />
          <Card className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-tinta-2">Tempo até o primeiro pedido</span>
              <Timer strokeWidth={1.75} className="size-4 text-tinta-2" aria-hidden />
            </div>
            {consulta.data.tempo_ate_primeiro_pedido_min !== null ? (
              <>
                <span className="tabular text-2xl text-salvia">
                  {formatarDuracao(consulta.data.tempo_ate_primeiro_pedido_min)}
                </span>
                {consulta.data.primeiro_pedido_em && (
                  <span className="text-xs text-tinta-2">
                    Primeiro pedido em {formatarDataHora(consulta.data.primeiro_pedido_em)}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-lg text-tinta-2">Ainda sem pedidos</span>
                <span className="text-xs text-tinta-2">
                  A contagem começou em {formatarDataHora(consulta.data.iniciado_em)}, quando a loja foi criada.
                </span>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
