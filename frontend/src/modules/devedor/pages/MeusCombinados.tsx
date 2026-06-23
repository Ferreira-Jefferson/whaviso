// /meus: combinados ativos do devedor (home da área). Mobile-first: o devedor
// chega pelo celular. Pendentes ("no ciclo") em destaque no topo; cada item leva
// ao detalhe. EmptyState quando não há vínculo (estado legítimo, risco nº 1).
// Linguagem das Regras de Ouro: só "combinado/lembrete" (ver linguagem.ts).
import { Link } from 'react-router'
import { Inbox, ChevronRight, CalendarDays } from 'lucide-react'
import {
  Card,
  EmptyState,
  MoneyText,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { dataPtBR } from '@/shared/format'
import { usePerfil } from '@/shared/auth'
import type { Aviso } from '@/shared/contracts'
import { useMeusCombinados } from '../api'

// Combinados "ativos" do devedor: aguardando aceite ou no ciclo.
const STATUS_ATIVOS: ReadonlySet<Aviso['status']> = new Set(['aguardando_aceite', 'programado'])

export default function MeusCombinadosPage() {
  const perfil = usePerfil()
  const { data, isLoading, isError } = useMeusCombinados(perfil?.id)

  const ativos = (data?.itens ?? []).filter((a) => STATUS_ATIVOS.has(a.status))
  // Pendentes ("no ciclo") primeiro: são os que pedem ação do devedor.
  const ordenados = [...ativos].sort((a, b) => {
    if (a.status === b.status) return 0
    return a.status === 'programado' ? -1 : 1
  })

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Meus combinados"
        descricao="Os combinados em que você foi convidado e ainda estão no ciclo."
      />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          titulo="Não foi possível carregar"
          descricao="Verifique sua conexão e tente novamente."
        />
      ) : ordenados.length === 0 ? (
        <EmptyState
          icone={<Inbox strokeWidth={1.5} className="size-10" />}
          titulo="Nenhum combinado por aqui"
          descricao="Quando alguém te convidar para um combinado, ele aparece nesta lista. Os já encerrados ficam no histórico."
          acao={
            <Link to="/meus/historico" className="text-sm font-medium text-salvia hover:underline">
              Ver histórico
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {ordenados.map((aviso) => (
            <li key={aviso.id}>
              <CombinadoCard aviso={aviso} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CombinadoCard({ aviso }: { aviso: Aviso }) {
  return (
    <Link to={`/meus/combinados/${aviso.id}`} className="block">
      <Card className="flex items-center gap-4 transition-colors hover:bg-papel-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="truncate font-medium text-tinta">{aviso.motivo}</p>
            <StatusBadge status={aviso.status} />
          </div>
          <MoneyText centavos={aviso.valor_centavos} className="text-xl" />
          <p className="mt-1 flex items-center gap-1.5 text-xs text-tinta-2">
            <CalendarDays strokeWidth={1.75} className="size-3.5" />
            Combinado para {dataPtBR(aviso.data_combinada)}
          </p>
        </div>
        <ChevronRight strokeWidth={1.75} className="size-5 shrink-0 text-tinta-2" />
      </Card>
    </Link>
  )
}
