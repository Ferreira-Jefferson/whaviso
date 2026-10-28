import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChefHat } from 'lucide-react'
import type { PedidoCard } from '@/shared/contracts/_generated/pedidos'
import { ApiError } from '@/shared/api_client'
import { diaSaoPaulo } from '@/shared/format'
import { useEstadoRealtime, useRealtime } from '@/shared/realtime'
import { cn, EmptyState, ErrorState, Skeleton, useToast } from '@/shared/ui'
import { useAvancarPedido, useDetalhesPedidos, useQuadroCozinha } from '../api'
import { CartaoCozinha } from '../components/CartaoCozinha'
import { acaoPrincipal, LANES } from '../estados'

const DESTAQUE_MS = 6000

/** Relogio de apresentacao (tempo decorrido nos tickets). Nao decide etapa nem agendamento. */
function useAgora(intervaloMs = 30000): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), intervaloMs)
    return () => window.clearInterval(t)
  }, [intervaloMs])
  return agora
}

export default function Cozinha() {
  const agora = useAgora()
  const { mostrarToast } = useToast()
  const estadoVivo = useEstadoRealtime()

  // O dia de negocio e fixado na montagem; a virada do dia pede recarregar a tela.
  const [hoje] = useState(() => diaSaoPaulo(new Date().toISOString()))
  const quadro = useQuadroCozinha(hoje)
  const avancar = useAvancarPedido()

  const colunas = quadro.data?.colunas
  const cards = useMemo<PedidoCard[]>(
    () => LANES.flatMap((l) => colunas?.[l.chave]?.itens ?? []),
    [colunas],
  )
  const { porId, carregando: carregandoItens } = useDetalhesPedidos(cards.map((c) => c.id))

  // Realtime: a invalidacao de ['pedidos'] ja vem do MAPA_INVALIDACAO; aqui so realcamos o que mudou.
  const [destacados, setDestacados] = useState<ReadonlySet<string>>(new Set())
  const timers = useRef(new Set<number>())
  useEffect(() => {
    const ativos = timers.current
    return () => ativos.forEach((t) => window.clearTimeout(t))
  }, [])
  useRealtime(
    'pedido.atualizado',
    useCallback((e) => {
      const id = e.payload['pedido_id']
      if (typeof id !== 'string') return
      setDestacados((atual) => new Set(atual).add(id))
      const t = window.setTimeout(() => {
        timers.current.delete(t)
        setDestacados((atual) => {
          const prox = new Set(atual)
          prox.delete(id)
          return prox
        })
      }, DESTAQUE_MS)
      timers.current.add(t)
    }, []),
  )

  const aoAvancar = useCallback(
    (card: PedidoCard) => {
      const acao = acaoPrincipal(card)
      if (!acao) return
      avancar.mutate(
        { id: card.id, para: acao.status },
        { onError: (err) => mostrarToast(err instanceof ApiError ? err.message : 'Não foi possível avançar o pedido.', { tom: 'erro' }) },
      )
    },
    [avancar, mostrarToast],
  )

  const ocupadoId = avancar.isPending ? (avancar.variables?.id ?? null) : null
  const total = cards.length

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linha pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl text-salvia md:text-3xl">
            <ChefHat className="size-7" aria-hidden /> Cozinha
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-xs font-bold',
                estadoVivo === 'ao_vivo' ? 'bg-folha/10 text-folha' : 'bg-barro/10 text-barro',
              )}
            >
              <span className="relative flex size-1.5" aria-hidden>
                {estadoVivo === 'ao_vivo' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-folha opacity-60" />}
                <span className={cn('relative inline-flex size-1.5 rounded-full', estadoVivo === 'ao_vivo' ? 'bg-folha' : 'bg-barro')} />
              </span>
              {estadoVivo === 'ao_vivo' ? 'Ao vivo' : 'Reconectando'}
            </span>
            <span>Pedidos entram e avançam sozinhos. Toque para iniciar o preparo ou marcar como pronto.</span>
          </p>
        </div>
      </header>

      {quadro.isPending && <Esqueleto />}
      {quadro.isError && <ErrorState aoTentarDeNovo={() => void quadro.refetch()} className="mt-4" />}

      {quadro.isSuccess && total === 0 && (
        <EmptyState
          className="mt-6"
          icone={<ChefHat className="size-7" aria-hidden />}
          titulo="Cozinha em dia"
          descricao="Nenhum pedido para preparar agora. Os novos pedidos aparecem aqui sozinhos."
        />
      )}

      {quadro.isSuccess && total > 0 && (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {LANES.map((lane) => {
            const itens = colunas?.[lane.chave]?.itens ?? []
            return (
              <section key={lane.chave} aria-label={lane.titulo} className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-bold text-tinta">{lane.titulo}</h2>
                  <span className="rounded-pill bg-papel-2 px-2 py-0.5 text-sm font-bold tabular-nums text-tinta-2">{itens.length}</span>
                </div>
                {itens.length === 0 ? (
                  <p className="rounded-card border border-dashed border-linha px-4 py-8 text-center text-sm text-tinta-2">
                    {lane.chave === 'novo' ? 'Sem pedidos na fila.' : 'Nada em preparo.'}
                  </p>
                ) : (
                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {itens.map((card) => (
                      <CartaoCozinha
                        key={card.id}
                        card={card}
                        detalhe={porId.get(card.id)}
                        agora={agora}
                        ocupado={ocupadoId === card.id}
                        destacado={destacados.has(card.id)}
                        aoAvancar={aoAvancar}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {carregandoItens && quadro.isSuccess && total > 0 && (
        <p className="sr-only" role="status">
          Carregando itens dos pedidos.
        </p>
      )}
    </div>
  )
}

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando pedidos da cozinha" className="mt-4 grid gap-5 lg:grid-cols-2">
      {[0, 1].map((lane) => (
        <div key={lane} className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="grid content-start gap-3 rounded-card border border-linha bg-papel-2 p-4">
              <Skeleton className="h-7 w-1/3" />
              <Skeleton className="h-20" />
              <Skeleton className="h-14" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
