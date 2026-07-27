// Lista read-only de combinados vinculados a algo (categoria, produto): reuso do padrão de
// linha já usado no modal de cliente (E15/E18), sem agrupar por nome. Mostra TODOS os estados
// (com e sem aviso, inclusive `sem_aviso`/agenda; quem filtra é a api, não este componente).
// Abrir um item fecha quem chamou (onFechar) e navega para o detalhe do combinado.
import { useNavigate } from 'react-router'
import type { Aviso } from '../contracts'
import { dataPtBR } from '../format'
import { EmptyState } from './EmptyState'
import { MoneyText } from './MoneyText'
import { Skeleton } from './Skeleton'
import { StatusBadge } from './StatusBadge'

export function ListaCombinados({
  itens,
  isLoading,
  vazioTitulo,
  vazioDescricao,
  onFechar,
}: {
  itens: Aviso[] | undefined
  isLoading: boolean
  vazioTitulo: string
  vazioDescricao: string
  onFechar: () => void
}) {
  const navigate = useNavigate()

  function abrir(id: string) {
    onFechar()
    navigate(`/app/avisos/${id}`)
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-card" />
        ))}
      </div>
    )
  }

  if (!itens || itens.length === 0) {
    return <EmptyState titulo={vazioTitulo} descricao={vazioDescricao} />
  }

  return (
    <ul className="flex flex-col divide-y divide-linha rounded-card border border-linha">
      {itens.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => abrir(a.id)}
            className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-salvia-claro focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-salvia sm:grid-cols-[minmax(0,1fr)_6.5rem_10.5rem_7rem]"
          >
            <span className="min-w-0 truncate text-tinta">{a.motivo}</span>
            <MoneyText centavos={a.valor_centavos} className="tabular text-right text-tinta-2" />
            <span className="hidden text-center text-xs text-tinta-2 sm:block">
              {dataPtBR(a.data_combinada)}
            </span>
            <span className="justify-self-start">
              <StatusBadge status={a.status} curto />
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
