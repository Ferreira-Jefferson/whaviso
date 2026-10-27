import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PedidoCard } from '@/shared/contracts/_generated/pedidos'
import type { ModalidadePedido, OrigemPedido, StatusPedido } from '@/shared/contracts/_generated/enums'
import { ApiError } from '@/shared/api_client'
import { diaSaoPaulo, formatarData } from '@/shared/format'
import { useRealtime } from '@/shared/realtime'
import { cn, EmptyState, ErrorState, SegmentedControl, Skeleton, useToast } from '@/shared/ui'
import { ClipboardList } from 'lucide-react'
import { useKanban, useMudarStatus } from '../api'
import { ColunaKanban } from '../components/ColunaKanban'
import { MotivoProblemaDialog } from '../components/MotivoProblemaDialog'
import { MoverPedidoDialog } from '../components/MoverPedidoDialog'
import { COLUNAS } from '../estados'
import type { ColunaKanban as Coluna } from '@/shared/contracts/_generated/pedidos'

type FiltroModalidade = 'todas' | ModalidadePedido
type FiltroOrigem = 'todas' | OrigemPedido

const OPCOES_MODALIDADE = [
  { value: 'todas', label: 'Todos' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'retirada', label: 'Retirada' },
] as const

const OPCOES_ORIGEM = [
  { value: 'todas', label: 'Toda origem' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ifood', label: 'iFood' },
  { value: 'manual', label: 'Manual' },
] as const

const DESTAQUE_MS = 6000

/** Relogio de apresentacao (tempo decorrido nos cards). Nao decide etapa nem agendamento. */
function useAgora(intervaloMs = 30000): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), intervaloMs)
    return () => window.clearInterval(t)
  }, [intervaloMs])
  return agora
}

export default function Pedidos() {
  const [modalidade, setModalidade] = useState<FiltroModalidade>('todas')
  const [origem, setOrigem] = useState<FiltroOrigem>('todas')
  const [colunaAtiva, setColunaAtiva] = useState<Coluna>('novo')
  const [paraProblema, setParaProblema] = useState<PedidoCard | null>(null)
  const [paraMover, setParaMover] = useState<PedidoCard | null>(null)
  const [arrastando, setArrastando] = useState<PedidoCard | null>(null)
  const [erroProblema, setErroProblema] = useState<string | null>(null)
  const [destacados, setDestacados] = useState<ReadonlySet<string>>(new Set())
  const agora = useAgora()
  const { mostrarToast } = useToast()

  // O dia de negocio e fixado na montagem; a virada do dia pede recarregar a tela.
  const [hoje] = useState(() => diaSaoPaulo(new Date().toISOString()))
  const filtros = useMemo(
    () => ({
      data: hoje,
      ...(modalidade !== 'todas' ? { modalidade } : {}),
      ...(origem !== 'todas' ? { origem } : {}),
    }),
    [hoje, modalidade, origem],
  )
  const kanban = useKanban(filtros)
  const mudar = useMudarStatus()

  // Realtime: a invalidacao de ['pedidos'] ja vem do MAPA_INVALIDACAO; aqui so destacamos o card que mudou.
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

  const aoMudar = useCallback(
    (card: PedidoCard, para: StatusPedido) => {
      mudar.mutate(
        { id: card.id, para },
        { onError: (e) => mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível mudar o pedido.', { tom: 'erro' }) },
      )
    },
    [mudar, mostrarToast],
  )

  // Soltar o card numa coluna: 'problema' pede motivo (abre o dialog); o resto muda direto.
  const aoSoltar = useCallback(
    (chave: Coluna) => {
      const card = arrastando
      setArrastando(null)
      if (!card) return
      if (chave === 'problema') {
        setErroProblema(null)
        setParaProblema(card)
        return
      }
      aoMudar(card, chave)
    },
    [arrastando, aoMudar],
  )

  const confirmarProblema = (motivo: string) => {
    if (!paraProblema) return
    setErroProblema(null)
    mudar.mutate(
      { id: paraProblema.id, para: 'problema', motivo },
      {
        onSuccess: () => setParaProblema(null),
        onError: (e) => setErroProblema(e instanceof ApiError ? e.message : 'Não foi possível marcar o problema.'),
      },
    )
  }

  const colunas = kanban.data?.colunas
  const total = COLUNAS.reduce((s, c) => s + (colunas?.[c.chave]?.itens.length ?? 0), 0)
  const abertos = (['novo', 'em_preparo', 'saiu_entrega'] as const).reduce((s, k) => s + (colunas?.[k]?.itens.length ?? 0), 0)
  const problemas = colunas?.problema?.itens.length ?? 0
  const ocupadoId = mudar.isPending ? (mudar.variables?.id ?? null) : null

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-linha pb-4">
        <div>
          <h1 className="text-2xl text-salvia md:text-3xl">Pedidos</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta-2">
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-folha/10 px-2 py-0.5 text-xs font-bold text-folha">
              <span className="relative flex size-1.5" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-folha opacity-60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-folha" />
              </span>
              Ao vivo
            </span>
            <span>Hoje, {formatarData(new Date(agora).toISOString())}. Atualiza sozinho quando um pedido muda.</span>
          </p>
        </div>
        <dl className="flex w-full items-stretch divide-x divide-linha overflow-hidden rounded-card border border-linha bg-cartao md:w-auto" aria-label="Resumo do dia">
          <Numero valor={total} rotulo="Pedidos" />
          <Numero valor={abertos} rotulo="Abertos" />
          <Numero valor={problemas} rotulo="Problemas" tom={problemas > 0 ? 'erro' : undefined} />
        </dl>
      </header>

      <div className="-mx-4 mb-1 mt-3 flex gap-2.5 overflow-x-auto px-4 md:mx-0 md:mb-4 md:mt-3.5 md:flex-wrap md:overflow-visible md:px-0 [&>*]:flex-none">
        <SegmentedControl ariaLabel="Modalidade" value={modalidade} onChange={setModalidade} options={OPCOES_MODALIDADE} className="flex-nowrap" />
        <SegmentedControl ariaLabel="Origem" value={origem} onChange={setOrigem} options={OPCOES_ORIGEM} className="flex-nowrap" />
      </div>

      {kanban.isPending && <EsqueletoQuadro />}
      {kanban.isError && <ErrorState aoTentarDeNovo={() => void kanban.refetch()} className="mt-4" />}

      {kanban.isSuccess && total === 0 && modalidade === 'todas' && origem === 'todas' && (
        <EmptyState
          className="mt-4"
          icone={<ClipboardList className="size-7" aria-hidden />}
          titulo="Nenhum pedido por enquanto"
          descricao="Quando um cliente pedir pelo WhatsApp, o pedido aparece aqui sozinho."
        />
      )}

      {kanban.isSuccess && (total > 0 || modalidade !== 'todas' || origem !== 'todas') && (
        <>
          <div role="tablist" aria-label="Colunas do quadro" className="sticky top-[60px] z-[4] -mx-4 flex gap-1.5 overflow-x-auto bg-papel px-4 pb-2.5 pt-2 md:hidden">
            {COLUNAS.map((c) => {
              const ativa = colunaAtiva === c.chave
              return (
                <button
                  key={c.chave}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  aria-controls={`coluna-${c.chave}`}
                  onClick={() => setColunaAtiva(c.chave)}
                  className={cn(
                    'inline-flex min-h-11 flex-none items-center gap-1.5 rounded-pill border px-3.5 text-sm',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
                    ativa ? 'border-salvia bg-salvia font-bold text-sobre-marca' : 'border-linha bg-cartao text-tinta-2',
                  )}
                >
                  {c.tituloCurto}
                  <span
                    className={cn(
                      'rounded-pill px-1.5 text-xs font-bold tabular-nums',
                      ativa ? 'bg-sobre-marca/20 text-sobre-marca' : c.chave === 'problema' && (colunas?.problema?.itens.length ?? 0) > 0 ? 'bg-barro/10 text-barro' : 'bg-papel-2 text-tinta-2',
                    )}
                  >
                    {colunas?.[c.chave]?.itens.length ?? 0}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="md:grid md:auto-cols-[minmax(284px,1fr)] md:grid-flow-col md:items-start md:gap-3.5 md:overflow-x-auto md:pb-3">
            {COLUNAS.map((c) => {
              const col = colunas?.[c.chave]
              return (
                <ColunaKanban
                  key={c.chave}
                  chave={c.chave}
                  titulo={c.titulo}
                  itens={col?.itens ?? []}
                  temMais={col?.proximoCursor != null}
                  ativaNoMobile={colunaAtiva === c.chave}
                  agora={agora}
                  destacados={destacados}
                  ocupadoId={ocupadoId}
                  arrastando={arrastando}
                  aoSoltar={aoSoltar}
                  aoAbrirMover={setParaMover}
                  aoArrastarInicio={setArrastando}
                  aoArrastarFim={() => setArrastando(null)}
                  aoMarcarProblema={(card) => {
                    setErroProblema(null)
                    setParaProblema(card)
                  }}
                />
              )
            })}
          </div>
        </>
      )}

      <MoverPedidoDialog
        card={paraMover}
        ocupado={paraMover != null && ocupadoId === paraMover.id}
        aoEscolher={(status) => {
          const card = paraMover
          setParaMover(null)
          if (card) aoMudar(card, status)
        }}
        aoCancelar={() => setParaMover(null)}
      />

      <MotivoProblemaDialog
        codigo={paraProblema?.codigo ?? null}
        carregando={mudar.isPending}
        erro={erroProblema}
        aoConfirmar={confirmarProblema}
        aoCancelar={() => setParaProblema(null)}
      />
    </div>
  )
}

function Numero({ valor, rotulo, tom }: { valor: number; rotulo: string; tom?: 'erro' }) {
  const alerta = tom === 'erro' && valor > 0
  return (
    <div className={cn('flex flex-1 flex-col items-center gap-0.5 px-4 py-2 md:flex-none md:items-end md:px-5', alerta && 'bg-barro/5')}>
      <dt className="order-2 text-[11px] font-bold uppercase tracking-[0.06em] text-tinta-2">{rotulo}</dt>
      <dd className={cn('order-1 font-display text-[22px] font-semibold leading-none tabular-nums', alerta ? 'text-barro' : 'text-tinta')}>{valor}</dd>
    </div>
  )
}

function EsqueletoQuadro() {
  return (
    <div aria-busy="true" aria-label="Carregando pedidos" className="mt-4 grid gap-3.5 md:auto-cols-[minmax(284px,1fr)] md:grid-flow-col md:overflow-hidden">
      {[0, 1, 2].map((i) => (
        <div key={i} className="grid content-start gap-2.5 rounded-[14px] border border-linha bg-papel-2 p-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-26" />
          <Skeleton className="h-26" />
        </div>
      ))}
    </div>
  )
}
