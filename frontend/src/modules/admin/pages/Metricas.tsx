// /admin: Métricas do owner (GET /v1/admin/metricas).
// Mostra total de usuários, distribuição de avisos por status, distribuição de
// envios por status e taxas derivadas (aceite, opt-out, falhas de envio).
// Barras CSS simples (sem lib de gráfico, plano seção 2). Linguagem das Regras
// de Ouro em toda string (ver shared/contracts/linguagem.ts).
import { Activity, BellRing, Send, Users } from 'lucide-react'
import {
  AlternarVisaoOwner,
  Banner,
  Card,
  EmptyState,
  GraficoBarras,
  PageHeader,
  Skeleton,
  type BarraGrafico,
} from '@/shared/ui'
import { ROTULO_STATUS_AVISO, ROTULO_STATUS_ENVIO } from '@/shared/format'
import type { StatusAviso, StatusEnvio } from '@/shared/contracts'
import { useAdminMetricas } from '../api'

// StatCard só fala em centavos; aqui as métricas são CONTAGENS. Card próprio.
function ContadorCard({
  rotulo,
  valor,
  detalhe,
  icone,
}: {
  rotulo: string
  valor: string
  detalhe?: string
  icone: React.ReactNode
}) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-tinta-2">{rotulo}</span>
        <span className="text-tinta-2">{icone}</span>
      </div>
      <span className="tabular text-2xl text-salvia">{valor}</span>
      {detalhe && <span className="text-xs text-tinta-2">{detalhe}</span>}
    </Card>
  )
}

// Card de distribuição: mapeia as contagens por status (Record) para o template
// reusável GraficoBarras. É o que entrega valor ao owner sem expor avisos
// individuais: só as quantidades em cada status.
function Distribuicao({
  titulo,
  dados,
  rotulos,
  cor,
}: {
  titulo: string
  dados: Record<string, number>
  rotulos: Record<string, string>
  cor: string
}) {
  const barras: BarraGrafico[] = Object.entries(dados).map(([chave, n]) => ({
    rotulo: rotulos[chave] ?? chave,
    valor: n,
  }))
  return (
    <Card>
      <h2 className="mb-4 text-lg text-salvia">{titulo}</h2>
      <GraficoBarras dados={barras} cor={cor} />
    </Card>
  )
}

export default function MetricasPage() {
  const { data, isLoading, isError } = useAdminMetricas()

  if (isError) {
    return (
      <div className="animate-rise">
        <AlternarVisaoOwner atual="geral" />
        <PageHeader titulo="Métricas" descricao="Visão geral do whaviso." />
        <EmptyState
          titulo="Não foi possível carregar as métricas"
          descricao="Verifique sua conexão e tente novamente."
        />
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="animate-rise">
        <AlternarVisaoOwner atual="geral" />
        <PageHeader titulo="Métricas" descricao="Visão geral do whaviso." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-card" />
          ))}
        </div>
      </div>
    )
  }

  const avisos = data.avisos_por_status
  const envios = data.envios_por_status
  const totalAvisos = Object.values(avisos).reduce((s, n) => s + n, 0)
  const totalEnvios = Object.values(envios).reduce((s, n) => s + n, 0)

  // Taxas derivadas dos números brutos (denominadores honestos).
  const aceitos =
    (avisos.programado ?? 0) + (avisos.pago ?? 0) + (avisos.expirado ?? 0)
  const baseAceite = aceitos + (avisos.aguardando_aceite ?? 0)
  const taxaAceite = baseAceite > 0 ? Math.round((aceitos / baseAceite) * 100) : null

  const falhas = envios.falhou ?? 0
  const taxaFalha = totalEnvios > 0 ? Math.round((falhas / totalEnvios) * 100) : null

  return (
    <div className="animate-rise">
      <AlternarVisaoOwner atual="geral" />
      <PageHeader
        titulo="Métricas"
        descricao="Visão geral do whaviso: usuários, combinados e ciclo de lembretes."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ContadorCard
          rotulo="Usuários"
          valor={String(data.total_usuarios)}
          icone={<Users strokeWidth={1.75} className="size-4" />}
        />
        <ContadorCard
          rotulo="Combinados"
          valor={String(totalAvisos)}
          detalhe={`${avisos.aguardando_aceite ?? 0} aguardando aceite`}
          icone={<BellRing strokeWidth={1.75} className="size-4" />}
        />
        <ContadorCard
          rotulo="Taxa de aceite"
          valor={taxaAceite === null ? 'sem dados' : `${taxaAceite}%`}
          detalhe="combinados que saíram do aguardando"
          icone={<Activity strokeWidth={1.75} className="size-4" />}
        />
        <ContadorCard
          rotulo="Falhas de envio"
          valor={taxaFalha === null ? 'sem dados' : `${taxaFalha}%`}
          detalhe={`${falhas} de ${totalEnvios} lembretes`}
          icone={<Send strokeWidth={1.75} className="size-4" />}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Distribuicao
          titulo="Combinados por status"
          dados={avisos}
          rotulos={ROTULO_STATUS_AVISO as Record<StatusAviso, string>}
          cor="var(--color-salvia)"
        />
        <Distribuicao
          titulo="Lembretes por status"
          dados={envios}
          rotulos={ROTULO_STATUS_ENVIO as Record<StatusEnvio, string>}
          cor="var(--color-folha)"
        />
      </div>

      <Banner tom="info" className="mt-6">
        A taxa de opt-out (saídas dos lembretes) ainda não é exposta pela api de
        métricas. Quando o endpoint informar o total de saídas, ela aparece aqui.
      </Banner>
    </div>
  )
}
