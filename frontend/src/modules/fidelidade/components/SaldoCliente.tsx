// Saldo por cliente: busca o cliente (nome ou telefone, mostrado mascarado), mostra o saldo do livro
// e o extrato (acumulos e resgates). Somente leitura: acumular e resgatar sao do fluxo de pedidos.
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { formatarDataHora, brl } from '@/shared/format'
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton } from '@/shared/ui'
import { useBuscaCliente, useMovimentos, useSaldo, type ClienteBusca, type Movimento, type Saldo } from '../api'

function useDebounce(valor: string, ms = 300): string {
  const [adiado, setAdiado] = useState(valor)
  useEffect(() => {
    const t = window.setTimeout(() => setAdiado(valor), ms)
    return () => window.clearTimeout(t)
  }, [valor, ms])
  return adiado
}

const unidade = (modo: Saldo['modo'], valor: number) => (modo === 'cashback' ? brl(valor) : `${valor} ${valor === 1 ? 'ponto' : 'pontos'}`)

export function SaldoCliente() {
  const [busca, setBusca] = useState('')
  const termo = useDebounce(busca)
  const [cliente, setCliente] = useState<ClienteBusca | null>(null)
  const resultado = useBuscaCliente(termo)

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-2" aria-hidden />
        <Input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente por nome ou telefone"
          aria-label="Buscar cliente"
          className="pl-9"
        />
      </div>

      {termo.trim().length >= 2 && !cliente && (
        <>
          {resultado.isPending && <Skeleton className="h-14 w-full" />}
          {resultado.isError && <ErrorState aoTentarDeNovo={() => void resultado.refetch()} />}
          {resultado.isSuccess && resultado.data.itens.length === 0 && (
            <p className="text-sm text-tinta-2">Nenhum cliente encontrado.</p>
          )}
          {resultado.isSuccess && resultado.data.itens.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Resultados da busca">
              {resultado.data.itens.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setCliente(c)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-input border border-linha bg-cartao px-3 py-2 text-left text-sm hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
                  >
                    <span className="font-medium text-tinta">{c.nome ?? 'Cliente sem nome'}</span>
                    <span className="tabular text-tinta-2">{c.telefone_mascarado ?? 'Sem telefone'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {cliente ? (
        <PainelSaldo
          cliente={cliente}
          aoTrocar={() => {
            setCliente(null)
            setBusca('')
          }}
        />
      ) : (
        termo.trim().length < 2 && (
          <EmptyState titulo="Escolha um cliente" descricao="Digite ao menos 2 letras do nome ou parte do telefone para ver o saldo e o extrato." />
        )
      )}
    </div>
  )
}

function PainelSaldo({ cliente, aoTrocar }: { cliente: ClienteBusca; aoTrocar: () => void }) {
  const saldo = useSaldo(cliente.id)
  const extrato = useMovimentos(cliente.id)
  const movimentos = extrato.data?.pages.flatMap((p) => p.itens) ?? []

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-semibold text-tinta">{cliente.nome ?? 'Cliente sem nome'}</p>
          <p className="tabular text-sm text-tinta-2">{cliente.telefone_mascarado ?? 'Sem telefone'}</p>
        </div>
        <Button variante="secondary" onClick={aoTrocar}>
          Trocar cliente
        </Button>
      </Card>

      {saldo.isPending && <Skeleton className="h-24 w-full" />}
      {saldo.isError && <ErrorState aoTentarDeNovo={() => void saldo.refetch()} />}
      {saldo.isSuccess && (
        <Card>
          <p className="text-sm text-tinta-2">Saldo atual</p>
          <p className="text-3xl font-semibold tabular-nums text-salvia">{unidade(saldo.data.modo, saldo.data.saldo)}</p>
          {saldo.data.modo === 'pontos' && (
            <p className="text-xs text-tinta-2">Vale {brl(saldo.data.saldo_centavos)} no resgate.</p>
          )}
        </Card>
      )}

      <section>
        <h3 className="mb-2 text-sm font-medium text-tinta">Extrato</h3>
        {extrato.isPending && <Skeleton className="h-20 w-full" />}
        {extrato.isError && <ErrorState aoTentarDeNovo={() => void extrato.refetch()} />}
        {extrato.isSuccess && movimentos.length === 0 && (
          <p className="text-sm text-tinta-2">Sem movimentos ainda. O saldo nasce quando um pedido entregue acumula.</p>
        )}
        {movimentos.length > 0 && saldo.data && (
          <ul className="flex flex-col gap-1.5">
            {movimentos.map((m) => (
              <LinhaMovimento key={m.id} m={m} modo={saldo.data.modo} />
            ))}
          </ul>
        )}
        {extrato.hasNextPage && (
          <div className="mt-3 flex justify-center">
            <Button variante="secondary" loading={extrato.isFetchingNextPage} onClick={() => void extrato.fetchNextPage()}>
              Ver mais
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

function LinhaMovimento({ m, modo }: { m: Movimento; modo: Saldo['modo'] }) {
  const ganho = m.tipo === 'acumulo'
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-linha px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Badge tom={ganho ? 'sucesso' : 'atencao'}>{ganho ? 'Acúmulo' : 'Resgate'}</Badge>
        <span className="text-tinta">Pedido #{m.pedido_codigo}</span>
        <span className="text-xs tabular-nums text-tinta-2">{formatarDataHora(m.criado_em)}</span>
      </div>
      <div className="text-right">
        <span className={`font-medium tabular-nums ${ganho ? 'text-folha' : 'text-ambar'}`}>
          {ganho ? '+' : '-'}
          {unidade(modo, m.valor)}
        </span>
        <span className="ml-2 text-xs tabular-nums text-tinta-2">saldo {unidade(modo, m.saldo_apos)}</span>
      </div>
    </li>
  )
}
