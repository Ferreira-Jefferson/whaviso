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
        <div className="grid animate-rise items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ChecklistOnboarding dados={consulta.data} />
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-tinta-2">Tempo até o primeiro pedido</span>
              <span className="inline-flex size-8 flex-none items-center justify-center rounded-full bg-salvia/10 text-salvia">
                <Timer strokeWidth={1.75} className="size-4" aria-hidden />
              </span>
            </div>
            {consulta.data.tempo_ate_primeiro_pedido_min !== null ? (
              <div>
                <p className="tabular text-2xl tracking-tight text-salvia">
                  {formatarDuracao(consulta.data.tempo_ate_primeiro_pedido_min)}
                </p>
                {consulta.data.primeiro_pedido_em && (
                  <p className="mt-1 text-xs text-tinta-2">
                    Primeiro pedido em {formatarDataHora(consulta.data.primeiro_pedido_em)}
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-base font-medium text-tinta">Ainda sem pedidos</p>
                <p className="mt-1 text-xs text-tinta-2">
                  A contagem começou em {formatarDataHora(consulta.data.iniciado_em)}, quando a loja foi criada.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
