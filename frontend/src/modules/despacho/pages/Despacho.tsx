// /despacho: painel de despacho. Pedidos prontos para sair (atribuir motoboy ou montar corrida),
// corridas abertas (sequenciar, despachar, concluir) e a carga de cada motoboy. O painel se
// atualiza sozinho. Todas as regras (pedido em corrida, corrida imutavel etc.) sao da api.
import { useMemo, useState } from 'react'
import { Bike, PackageCheck, Route } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  useToast,
} from '@/shared/ui'
import { useAdicionarPedidos, useAtribuirMotoboy, useCriarCorrida, useDespachoPainel } from '../api'
import { CorridaCard } from '../components/CorridaCard'
import { PedidoProntoCard } from '../components/PedidoProntoCard'
import { ROTULO_VEICULO, estadoDaCorrida } from '../estados'

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

export default function Despacho() {
  const painel = useDespachoPainel()
  const atribuir = useAtribuirMotoboy()
  const criar = useCriarCorrida()
  const adicionar = useAdicionarPedidos()
  const { mostrarToast } = useToast()

  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(new Set())
  const [motoboyNova, setMotoboyNova] = useState('')
  const [corridaAlvo, setCorridaAlvo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [atribuindoId, setAtribuindoId] = useState<string | null>(null)

  const prontos = useMemo(() => painel.data?.pedidos_prontos ?? [], [painel.data])
  const corridas = useMemo(() => painel.data?.corridas ?? [], [painel.data])
  const motoboys = useMemo(() => painel.data?.motoboys ?? [], [painel.data])
  const corridasMontando = corridas.filter((c) => estadoDaCorrida(c) === 'montando')

  // So conta o que ainda esta pronto (o painel atualiza sozinho e pedidos saem da lista).
  const idsSelecionados = prontos.filter((p) => selecionados.has(p.pedido_id)).map((p) => p.pedido_id)
  const alvoValido = corridasMontando.some((c) => c.id === corridaAlvo) ? corridaAlvo : (corridasMontando[0]?.id ?? '')

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function atribuirMotoboy(pedidoId: string, motoboyId: string) {
    setErro(null)
    setAtribuindoId(pedidoId)
    atribuir.mutate(
      { pedidoId, motoboyId },
      {
        onSuccess: () => mostrarToast('Motoboy atribuído ao pedido.', { tom: 'sucesso' }),
        onError: (e) => setErro(mensagem(e, 'Não foi possível atribuir o motoboy.')),
        onSettled: () => setAtribuindoId(null),
      },
    )
  }

  function novaCorrida() {
    setErro(null)
    criar.mutate(
      { motoboyId: motoboyNova || undefined, pedidoIds: idsSelecionados },
      {
        onSuccess: () => {
          setSelecionados(new Set())
          setMotoboyNova('')
          mostrarToast('Corrida criada. Confira a ordem das paradas e despache.', { tom: 'sucesso' })
        },
        onError: (e) => setErro(mensagem(e, 'Não foi possível criar a corrida.')),
      },
    )
  }

  function adicionarAFila() {
    if (!alvoValido) return
    setErro(null)
    adicionar.mutate(
      { corridaId: alvoValido, pedidoIds: idsSelecionados },
      {
        onSuccess: () => {
          setSelecionados(new Set())
          mostrarToast('Pedidos adicionados à corrida.', { tom: 'sucesso' })
        },
        onError: (e) => setErro(mensagem(e, 'Não foi possível adicionar à corrida.')),
      },
    )
  }

  return (
    <div>
      <header className="mb-6 border-b border-linha pb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl text-salvia sm:text-3xl">Despacho</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta-2">
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-folha/10 px-2 py-0.5 text-xs font-bold text-folha">
                <span className="relative flex size-1.5" aria-hidden>
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-folha opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-folha" />
                </span>
                Ao vivo
              </span>
              <span>Pedidos prontos para sair, corridas em montagem e em rota. Atualiza sozinho.</span>
            </p>
          </div>
        </div>
      </header>

      {painel.isPending && (
        <div aria-busy="true" aria-label="Carregando despacho" className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {painel.isError && <ErrorState aoTentarDeNovo={() => void painel.refetch()} />}

      {painel.isSuccess && (
        <div className="flex flex-col gap-8">
          <dl
            className="flex items-stretch divide-x divide-linha overflow-hidden rounded-card border border-linha bg-cartao"
            aria-label="Situação do despacho agora"
          >
            <Contador icone={<PackageCheck className="size-4" aria-hidden />} rotulo="Prontos" valor={prontos.length} />
            <Contador icone={<Route className="size-4" aria-hidden />} rotulo="Corridas" valor={corridas.length} />
            <Contador icone={<Bike className="size-4" aria-hidden />} rotulo="Motoboys" valor={motoboys.length} />
          </dl>

          {erro && <Banner tom="erro">{erro}</Banner>}

          <section aria-labelledby="titulo-prontos" className="flex flex-col gap-3">
            <h2 id="titulo-prontos" className="flex items-baseline gap-2 text-xl text-salvia">
              Prontos para sair
              {prontos.length > 0 && <span className="text-sm font-normal tabular-nums text-tinta-2">{prontos.length}</span>}
            </h2>

            {idsSelecionados.length > 0 && (
              <Card className="flex flex-col gap-3 border-salvia bg-salvia-claro p-4">
                <p className="text-sm font-medium text-tinta">
                  {idsSelecionados.length} {idsSelecionados.length === 1 ? 'pedido selecionado' : 'pedidos selecionados'}.
                  A ordem das paradas segue a ordem da lista; ajuste na corrida depois.
                </p>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Select
                      className="min-w-0 flex-1 basis-44"
                      ariaLabel="Motoboy da nova corrida"
                      value={motoboyNova}
                      onChange={setMotoboyNova}
                      options={[
                        { value: '', label: 'Motoboy ' },
                        ...motoboys.map((m) => ({ value: m.id, label: m.nome })),
                      ]}
                    />
                    <Button loading={criar.isPending} onClick={novaCorrida}>
                      Nova corrida
                    </Button>
                  </div>
                  {corridasMontando.length > 0 && (
                    <div className="flex flex-1 flex-wrap items-center gap-2">
                      <Select
                        className="min-w-0 flex-1 basis-44"
                        ariaLabel="Corrida para adicionar os pedidos"
                        value={alvoValido}
                        onChange={setCorridaAlvo}
                        options={corridasMontando.map((c, i) => ({
                          value: c.id,
                          label: `Corrida ${i + 1}${c.motoboy_nome ? ` (${c.motoboy_nome})` : ''}`,
                        }))}
                      />
                      <Button variante="secondary" loading={adicionar.isPending} onClick={adicionarAFila}>
                        Adicionar à corrida
                      </Button>
                    </div>
                  )}
                  <Button variante="ghost" onClick={() => setSelecionados(new Set())}>
                    Limpar seleção
                  </Button>
                </div>
              </Card>
            )}

            {prontos.length === 0 ? (
              <EmptyState
                icone={<PackageCheck className="size-7" aria-hidden />}
                titulo="Nenhum pedido pronto para sair"
                descricao="Pedidos de entrega sem motoboy aparecem aqui assim que entram em preparo."
              />
            ) : (
              <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {prontos.map((p) => (
                  <li key={p.pedido_id}>
                    <PedidoProntoCard
                      pedido={p}
                      motoboys={motoboys}
                      selecionado={selecionados.has(p.pedido_id)}
                      aoAlternar={() => alternar(p.pedido_id)}
                      aoAtribuir={(motoboyId) => atribuirMotoboy(p.pedido_id, motoboyId)}
                      atribuindo={atribuindoId === p.pedido_id}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="titulo-corridas" className="flex flex-col gap-3">
            <h2 id="titulo-corridas" className="flex items-baseline gap-2 text-xl text-salvia">
              Corridas
              {corridas.length > 0 && <span className="text-sm font-normal tabular-nums text-tinta-2">{corridas.length}</span>}
            </h2>
            {corridas.length === 0 ? (
              <EmptyState
                icone={<Route className="size-7" aria-hidden />}
                titulo="Nenhuma corrida aberta"
                descricao="Selecione pedidos prontos e monte uma corrida para um motoboy."
              />
            ) : (
              <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {corridas.map((c) => (
                  <li key={c.id}>
                    <CorridaCard corrida={c} motoboys={motoboys} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="titulo-motoboys" className="flex flex-col gap-3">
            <h2 id="titulo-motoboys" className="flex items-baseline gap-2 text-xl text-salvia">
              Motoboys
              {motoboys.length > 0 && <span className="text-sm font-normal tabular-nums text-tinta-2">{motoboys.length}</span>}
            </h2>
            {motoboys.length === 0 ? (
              <EmptyState
                icone={<Bike className="size-7" aria-hidden />}
                titulo="Nenhum motoboy ativo"
                descricao="Cadastre motoboys para atribuir entregas."
              />
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {motoboys.map((m) => {
                  const livre = m.corridas_abertas === 0 && m.pedidos_em_aberto === 0
                  return (
                    <li key={m.id}>
                      <Card className="flex items-center gap-3 p-4">
                        <span
                          aria-hidden
                          className="flex size-10 flex-none items-center justify-center rounded-full bg-papel-2 text-sm font-bold text-tinta-2"
                        >
                          {inicialMotoboy(m.nome)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-medium text-tinta">{m.nome}</span>
                          <span className="text-xs text-tinta-2">{ROTULO_VEICULO[m.veiculo]}</span>
                        </span>
                        {livre ? (
                          <Badge tom="sucesso">Livre</Badge>
                        ) : (
                          <span className="flex-none text-right text-xs text-tinta-2">
                            <span className="tabular block text-tinta">
                              {m.corridas_abertas} {m.corridas_abertas === 1 ? 'corrida' : 'corridas'}
                            </span>
                            <span className="tabular block">
                              {m.pedidos_em_aberto} {m.pedidos_em_aberto === 1 ? 'pedido' : 'pedidos'}
                            </span>
                          </span>
                        )}
                      </Card>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

/** Primeira letra do nome do motoboy (avatar decorativo); `?` quando vazio. */
function inicialMotoboy(nome: string): string {
  const letra = nome.trim().charAt(0)
  return letra ? letra.toUpperCase() : '?'
}

function Contador({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: number }) {
  return (
    <div className="flex flex-1 flex-col gap-1.5 px-4 py-3 sm:px-5">
      <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-tinta-2">
        <span className="text-salvia">{icone}</span>
        {rotulo}
      </dt>
      <dd className="font-display text-[26px] font-semibold leading-none tabular-nums text-tinta">{valor}</dd>
    </div>
  )
}
