// /meus/historico: combinados encerrados do devedor (pagos/cancelados/expirados).
// Filtro por status na URL (searchParams), igual à lista do cobrador. Mobile-first.
// Linguagem das Regras de Ouro: só "combinado/encerrado/recebido" (ver linguagem.ts).
import { Link, useSearchParams } from 'react-router'
import { History as HistoryIcon, ChevronRight, CalendarDays } from 'lucide-react'
import {
  Card,
  EmptyState,
  MoneyText,
  PageHeader,
  SegmentedControl,
  Skeleton,
  StatusBadge,
} from '@/shared/ui'
import { dataPtBR } from '@/shared/format'
import { usePerfil } from '@/shared/auth'
import { statusAviso, type Aviso, type StatusAviso } from '@/shared/contracts'
import { useMeusCombinados } from '../api'

// Status terminais que compõem o histórico do devedor.
const STATUS_HISTORICO: ReadonlySet<StatusAviso> = new Set(['pago', 'cancelado', 'expirado'])

const ABA_TODOS = 'todos'
type Aba = typeof ABA_TODOS | 'pago' | 'cancelado' | 'expirado'

const ABAS: ReadonlyArray<{ value: Aba; label: string }> = [
  { value: ABA_TODOS, label: 'Todos' },
  { value: 'pago', label: 'Recebidos' },
  { value: 'cancelado', label: 'Cancelados' },
  { value: 'expirado', label: 'Encerrados' },
]

function lerAba(raw: string | null): Aba {
  if (!raw || raw === ABA_TODOS) return ABA_TODOS
  if (statusAviso.safeParse(raw).success && STATUS_HISTORICO.has(raw as StatusAviso)) {
    return raw as Aba
  }
  return ABA_TODOS
}

export default function HistoricoPage() {
  const perfil = usePerfil()
  const [params, setParams] = useSearchParams()
  const aba = lerAba(params.get('status'))

  // O backend filtra um único status por vez; "todos" busca tudo e filtra os
  // terminais no cliente. Para uma aba específica, delega ao backend.
  const { data, isLoading, isError } = useMeusCombinados(
    perfil?.id,
    aba === ABA_TODOS ? {} : { status: aba },
  )

  const itens = (data?.itens ?? []).filter((a) => STATUS_HISTORICO.has(a.status))

  function setAba(valor: Aba) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (valor === ABA_TODOS) next.delete('status')
        else next.set('status', valor)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Histórico"
        descricao="Combinados já encerrados: recebidos, cancelados ou encerrados sem confirmação."
      />

      <div className="mb-4">
        <SegmentedControl<Aba>
          ariaLabel="Filtrar por situação"
          value={aba}
          onChange={setAba}
          options={ABAS}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-card" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          titulo="Não foi possível carregar"
          descricao="Verifique sua conexão e tente novamente."
        />
      ) : itens.length === 0 ? (
        <EmptyState
          icone={<HistoryIcon strokeWidth={1.5} className="size-10" />}
          titulo="Nada no histórico ainda"
          descricao="Combinados concluídos ou encerrados aparecem aqui."
          acao={
            <Link to="/meus" className="text-sm font-medium text-salvia hover:underline">
              Ver combinados ativos
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {itens.map((aviso) => (
            <li key={aviso.id}>
              <ItemHistorico aviso={aviso} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ItemHistorico({ aviso }: { aviso: Aviso }) {
  return (
    <Link to={`/meus/combinados/${aviso.id}`} className="block">
      <Card className="flex items-center gap-4 transition-colors hover:bg-papel-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="truncate font-medium text-tinta">{aviso.motivo}</p>
            <StatusBadge status={aviso.status} />
          </div>
          <MoneyText centavos={aviso.valor_centavos} className="text-lg" />
          <p className="mt-1 flex items-center gap-1.5 text-xs text-tinta-2">
            <CalendarDays strokeWidth={1.75} className="size-3.5" />
            {dataPtBR(aviso.data_combinada)}
          </p>
        </div>
        <ChevronRight strokeWidth={1.75} className="size-5 shrink-0 text-tinta-2" />
      </Card>
    </Link>
  )
}
