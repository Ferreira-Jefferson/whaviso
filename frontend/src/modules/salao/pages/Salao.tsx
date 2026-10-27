// Controle de salao da loja ativa (/salao): grade de mesas com estado (livre/ocupada) e o
// painel da comanda aberta ao lado. Abrir comanda numa mesa livre, lancar itens, ver o total
// e fechar. Cadastro de mesa por dialog. Dados pela api REST (raiz de cache ['salao']); nada
// e decidido no cliente (preco e estado vem do servidor). Nao importa outros modulos.
import { useCallback, useMemo, useState } from 'react'
import { LayoutGrid, Plus } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Button, EmptyState, ErrorState, Skeleton, cn, useToast } from '@/shared/ui'
import type { MesaSaida } from '@/shared/contracts/_generated/salao'
import { useAbrirComanda, useMesas } from '../api'
import { estadoDaMesa } from '../estados'
import { MesaCard } from '../components/MesaCard'
import { MesaDialog } from '../components/MesaDialog'
import { ComandaPanel } from '../components/ComandaPanel'
import { LancarItemDialog } from '../components/LancarItemDialog'

export default function Salao() {
  const { mostrarToast } = useToast()
  const mesas = useMesas()
  const abrir = useAbrirComanda()

  const [comandaSelecionada, setComandaSelecionada] = useState<string | null>(null)
  const [dlgMesa, setDlgMesa] = useState<{ aberto: boolean; mesa: MesaSaida | null }>({ aberto: false, mesa: null })
  const [dlgLancar, setDlgLancar] = useState(false)

  const lista = useMemo(() => mesas.data ?? [], [mesas.data])
  const resumo = useMemo(() => {
    let ativas = 0
    let livres = 0
    let ocupadas = 0
    for (const m of lista) {
      const e = estadoDaMesa(m)
      if (e === 'inativa') continue
      ativas++
      if (e === 'ocupada') ocupadas++
      else livres++
    }
    return { ativas, livres, ocupadas }
  }, [lista])

  const abrindoMesaId = abrir.isPending ? (abrir.variables?.mesa_id ?? null) : null

  const aoAbrirComanda = useCallback(
    (mesa: MesaSaida) => {
      abrir.mutate(
        { mesa_id: mesa.id },
        {
          onSuccess: (c) => setComandaSelecionada(c.id),
          onError: (e) => mostrarToast(e instanceof ApiError ? e.message : 'Nao foi possivel abrir a comanda.', { tom: 'erro' }),
        },
      )
    },
    [abrir, mostrarToast],
  )

  const temSelecao = comandaSelecionada != null

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linha pb-4">
        <div>
          <h1 className="text-2xl text-salvia md:text-3xl">Salão</h1>
          <p className="mt-1 text-sm text-tinta-2">Mesas e comandas. Abra uma comanda numa mesa livre e lance os itens do atendimento.</p>
        </div>
        <dl className="flex w-full justify-between gap-4 md:w-auto md:gap-6" aria-label="Resumo do salao">
          <Numero valor={resumo.ativas} rotulo="Mesas" />
          <Numero valor={resumo.livres} rotulo="Livres" />
          <Numero valor={resumo.ocupadas} rotulo="Ocupadas" />
        </dl>
      </header>

      <div className="mb-4 mt-3.5 flex justify-end">
        <Button onClick={() => setDlgMesa({ aberto: true, mesa: null })} className="max-md:w-full">
          <Plus strokeWidth={1.75} className="size-4" aria-hidden />
          Nova mesa
        </Button>
      </div>

      {mesas.isPending && <Esqueleto />}
      {mesas.isError && <ErrorState aoTentarDeNovo={() => void mesas.refetch()} />}

      {mesas.isSuccess && lista.length === 0 && (
        <EmptyState
          icone={<LayoutGrid className="size-7" aria-hidden />}
          titulo="Nenhuma mesa cadastrada"
          descricao="Cadastre a primeira mesa do salao para comecar a abrir comandas."
          acao={
            <Button onClick={() => setDlgMesa({ aberto: true, mesa: null })}>
              <Plus strokeWidth={1.75} className="size-4" aria-hidden />
              Nova mesa
            </Button>
          }
        />
      )}

      {mesas.isSuccess && lista.length > 0 && (
        <div className="md:flex md:items-start md:gap-6">
          <div className={cn('grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 md:flex-1', temSelecao && 'max-md:hidden')}>
            {lista.map((mesa) => (
              <MesaCard
                key={mesa.id}
                mesa={mesa}
                selecionada={comandaSelecionada != null && comandaSelecionada === mesa.comanda_aberta_id}
                abrindo={abrindoMesaId === mesa.id}
                aoAbrirComanda={aoAbrirComanda}
                aoVerComanda={setComandaSelecionada}
                aoEditar={(m) => setDlgMesa({ aberto: true, mesa: m })}
              />
            ))}
          </div>

          {temSelecao && comandaSelecionada && (
            <div className="mt-4 md:mt-0 md:w-[360px] md:flex-none">
              <ComandaPanel
                comandaId={comandaSelecionada}
                aoLancarItem={() => setDlgLancar(true)}
                aoFechada={() => setComandaSelecionada(null)}
                aoVoltar={() => setComandaSelecionada(null)}
              />
            </div>
          )}
        </div>
      )}

      <MesaDialog
        aberto={dlgMesa.aberto}
        mesa={dlgMesa.mesa}
        onFechar={() => setDlgMesa((s) => ({ ...s, aberto: false }))}
      />
      <LancarItemDialog
        aberto={dlgLancar}
        comandaId={comandaSelecionada}
        onFechar={() => setDlgLancar(false)}
      />
    </div>
  )
}

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="grid md:text-right">
      <dd className="order-1 font-display text-[22px] font-semibold leading-tight tabular-nums">{valor}</dd>
      <dt className="order-2 text-xs font-bold uppercase tracking-[0.04em] text-tinta-2">{rotulo}</dt>
    </div>
  )
}

function Esqueleto() {
  return (
    <div aria-busy="true" aria-label="Carregando mesas" className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="rounded-card border border-linha bg-cartao p-4">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="mt-3 h-4 w-1/3" />
          <Skeleton className="mt-4 h-11" />
        </div>
      ))}
    </div>
  )
}
