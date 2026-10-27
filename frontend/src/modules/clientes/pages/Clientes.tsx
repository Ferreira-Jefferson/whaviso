import { useEffect, useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { formatarData } from '@/shared/format'
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  TableResponsive,
  type ColunaTabela,
} from '@/shared/ui'
import { useClientes, type ClienteItem } from '../api'
import { DetalheClienteDialog } from '../components/DetalheClienteDialog'

const COLUNAS: ReadonlyArray<ColunaTabela<ClienteItem>> = [
  {
    chave: 'nome',
    titulo: 'Cliente',
    principal: true,
    render: (c) => <span className="font-medium">{c.nome ?? 'Cliente sem nome'}</span>,
  },
  {
    chave: 'telefone',
    titulo: 'Telefone',
    render: (c) => <span className="tabular text-tinta-2">{c.telefone_mascarado ?? 'Nao informado'}</span>,
  },
  {
    chave: 'pedidos',
    titulo: 'Pedidos',
    alinhar: 'direita',
    render: (c) => <span className="tabular-nums">{c.pedidos_total}</span>,
  },
  {
    chave: 'atividade',
    titulo: 'Ultima atividade',
    alinhar: 'direita',
    render: (c) => <span className="tabular-nums text-tinta-2">{formatarData(c.ultima_atividade)}</span>,
  },
]

/** Debounce simples do termo de busca (nao ha hook compartilhado). */
function useDebounce(valor: string, ms = 300): string {
  const [adiado, setAdiado] = useState(valor)
  useEffect(() => {
    const t = window.setTimeout(() => setAdiado(valor), ms)
    return () => window.clearTimeout(t)
  }, [valor, ms])
  return adiado
}

export default function Clientes() {
  const [busca, setBusca] = useState('')
  const termo = useDebounce(busca)
  const [abertoId, setAbertoId] = useState<string | null>(null)

  const lista = useClientes(termo)
  const itens = useMemo(() => lista.data?.pages.flatMap((p) => p.itens) ?? [], [lista.data])
  const buscando = termo.trim().length > 0
  const vazio = lista.isSuccess && itens.length === 0

  return (
    <div>
      <PageHeaderBusca busca={busca} aoBuscar={setBusca} />

      {lista.isPending && <EsqueletoLista />}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} className="mt-4" />}

      {vazio && (
        <EmptyState
          className="mt-4"
          icone={<Users className="size-7" aria-hidden />}
          titulo={buscando ? 'Nenhum cliente encontrado' : 'Ainda sem clientes'}
          descricao={
            buscando
              ? 'Tente outro nome ou parte do telefone.'
              : 'Quando alguem fizer um pedido pelo WhatsApp, o cliente aparece aqui.'
          }
        />
      )}

      {lista.isSuccess && itens.length > 0 && (
        <>
          <TableResponsive
            colunas={COLUNAS}
            linhas={itens}
            chaveLinha={(c) => c.id}
            onRowClick={(c) => setAbertoId(c.id)}
            legenda="Lista de clientes"
          />
          {lista.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variante="secondary"
                loading={lista.isFetchingNextPage}
                onClick={() => void lista.fetchNextPage()}
              >
                Ver mais
              </Button>
            </div>
          )}
        </>
      )}

      <DetalheClienteDialog id={abertoId} aoFechar={() => setAbertoId(null)} />
    </div>
  )
}

function PageHeaderBusca({ busca, aoBuscar }: { busca: string; aoBuscar: (v: string) => void }) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-salvia sm:text-3xl">Clientes</h1>
          <p className="mt-1 text-sm text-tinta-2">Quem pede na sua loja.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-2" aria-hidden />
          <Input
            type="search"
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            aria-label="Buscar clientes"
            className="pl-9"
          />
        </div>
      </div>
      <div className="mt-4 h-px w-full bg-linha" />
    </header>
  )
}

function EsqueletoLista() {
  return (
    <div aria-busy="true" aria-label="Carregando clientes" className="mt-4 flex flex-col gap-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}
