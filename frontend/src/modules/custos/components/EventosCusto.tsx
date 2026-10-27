// Razao de eventos de custo (so categoria, origem, valor, quantidade e id de referencia:
// nunca conteudo de conversa nem telefone). Filtro por categoria e "carregar mais".
import { useState } from 'react'
import { Receipt } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorState, Select, Skeleton } from '@/shared/ui'
import { formatarCentavos, formatarDataHora } from '@/shared/format'
import { useEventosCusto, type CategoriaCusto } from '../api'
import type { Periodo } from '../periodo'
import { CATEGORIAS, ROTULO_CATEGORIA } from '../rotulos'

type Filtro = CategoriaCusto | 'todas'

const OPCOES = [
  { value: 'todas' as Filtro, label: 'Todas as categorias' },
  ...CATEGORIAS.map((c) => ({ value: c as Filtro, label: ROTULO_CATEGORIA[c] })),
]

export function EventosCusto({ periodo }: { periodo: Periodo }) {
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const q = useEventosCusto(periodo, filtro === 'todas' ? null : filtro)
  const itens = q.data?.pages.flatMap((p) => p.itens) ?? []

  return (
    <div className="grid gap-3">
      <Select className="w-full sm:w-72" ariaLabel="Filtrar eventos por categoria" value={filtro} onChange={setFiltro} options={OPCOES} />

      {q.isError ? (
        <ErrorState aoTentarDeNovo={() => void q.refetch()} />
      ) : q.isPending ? (
        <div className="grid gap-2" aria-busy="true"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-2/3" /></div>
      ) : itens.length === 0 ? (
        <EmptyState icone={<Receipt className="size-7" aria-hidden />} titulo="Nenhum custo registrado" descricao="Quando houver uso de IA, mensagens ou outros serviços, cada evento aparece aqui." />
      ) : (
        <>
          <ul className="divide-y divide-linha">
            {itens.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Badge tom="neutro">{ROTULO_CATEGORIA[e.categoria]}</Badge>
                    <span className="min-w-0 truncate text-tinta" title={e.origem}>
                      {e.origem}{e.quantidade > 1 ? ` · ${e.quantidade.toLocaleString('pt-BR')} un.` : ''}
                    </span>
                  </div>
                  <span className="tabular mt-1 block text-xs text-tinta-2">{formatarDataHora(e.criado_em)}</span>
                </div>
                <span className="tabular flex-none pt-0.5 text-right text-tinta">{formatarCentavos(e.valor_centavos)}</span>
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button variante="secondary" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage} loading={q.isFetchingNextPage}>
                {q.isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
