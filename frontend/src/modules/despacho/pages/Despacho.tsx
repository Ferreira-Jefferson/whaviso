// /despacho: painel de despacho. Pedidos prontos para sair (atribuir motoboy ou montar corrida),
// corridas abertas (sequenciar, despachar, concluir) e a carga de cada motoboy. O painel se
// atualiza sozinho. Todas as regras (pedido em corrida, corrida imutavel etc.) sao da api.
import { useMemo, useState } from 'react'
import { Bike, PackageCheck, Route } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
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
      <PageHeader
        titulo="Despacho"
        descricao="Pedidos prontos para sair, corridas em montagem e em rota."
      />

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
          <dl className="grid grid-cols-3 gap-3">
            <Contador icone={<PackageCheck className="size-4" aria-hidden />} rotulo="Prontos" valor={prontos.length} />
            <Contador icone={<Route className="size-4" aria-hidden />} rotulo="Corridas abertas" valor={corridas.length} />
            <Contador icone={<Bike className="size-4" aria-hidden />} rotulo="Motoboys ativos" valor={motoboys.length} />
          </dl>

          {erro && <Banner tom="erro">{erro}</Banner>}

          <section aria-labelledby="titulo-prontos" className="flex flex-col gap-3">
            <h2 id="titulo-prontos" className="text-xl text-salvia">
              Prontos para sair
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
                        { value: '', label: 'Motoboy (opcional)' },
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
            <h2 id="titulo-corridas" className="text-xl text-salvia">
              Corridas
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
            <h2 id="titulo-motoboys" className="text-xl text-salvia">
              Motoboys
            </h2>
            {motoboys.length === 0 ? (
              <EmptyState
                icone={<Bike className="size-7" aria-hidden />}
                titulo="Nenhum motoboy ativo"
                descricao="Cadastre motoboys para atribuir entregas."
              />
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {motoboys.map((m) => (
                  <li key={m.id}>
                    <Card className="flex items-center justify-between gap-3 p-4">
                      <span className="flex flex-col">
                        <span className="text-sm font-medium text-tinta">{m.nome}</span>
                        <span className="text-xs text-tinta-2">{ROTULO_VEICULO[m.veiculo]}</span>
                      </span>
                      <span className="text-right text-xs text-tinta-2">
                        <span className="tabular block">
                          {m.corridas_abertas} {m.corridas_abertas === 1 ? 'corrida' : 'corridas'}
                        </span>
                        <span className="tabular block">
                          {m.pedidos_em_aberto} {m.pedidos_em_aberto === 1 ? 'pedido' : 'pedidos'}
                        </span>
                      </span>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function Contador({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: number }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <dt className="flex items-center gap-1.5 text-xs text-tinta-2 sm:text-sm">
        <span className="text-salvia">{icone}</span>
        {rotulo}
      </dt>
      <dd className="tabular text-2xl text-salvia">{valor}</dd>
    </Card>
  )
}
