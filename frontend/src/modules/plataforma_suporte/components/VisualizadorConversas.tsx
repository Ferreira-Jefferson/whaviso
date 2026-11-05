// Visualizador READ-ONLY das conversas de uma loja (console, sob consentimento ativo). Replica
// enxuta da lista+thread de modules/conversas, SEM nenhuma acao de escrita: nao assume, nao
// responde, nao encerra. So leitura, para o operador dar suporte. Deixa visivel que o acesso e
// auditado. As chamadas usam os endpoints de conversas com override de loja (`lojaId`); o backend
// so libera leitura com acesso assistido ativo (403 caso contrario).
import { useEffect, useRef, useState } from 'react'
import { Eye, MessageCircle, Search, ShieldAlert } from 'lucide-react'
import { Banner, cn, EmptyState, Input, SegmentedControl, Skeleton, Spinner, type SegmentOption } from '@/shared/ui'
import { formatarData, formatarHora } from '@/shared/format'
import type { MensagemSaida } from '@/shared/contracts/_generated/conversas'
import type { StatusConversa } from '@/shared/contracts/_generated/enums'
import { useConversaLoja, useConversasLoja, useMensagensLoja, mensagensEmOrdem, type FiltrosConversas } from '../api'
import { AreaErro } from './AreaErro'
import {
  conteudoExibido,
  ladoDaBolha,
  previaLista,
  ROTULO_AUTOR,
  ROTULO_STATUS_CONVERSA,
} from '../conversas_ro'

type FiltroStatus = 'todas' | StatusConversa

const OPCOES_STATUS: ReadonlyArray<SegmentOption<FiltroStatus>> = [
  { value: 'todas', label: 'Todas' },
  { value: 'ia', label: 'Automação' },
  { value: 'aguardando', label: 'Aguardando' },
  { value: 'humano', label: 'Em atendimento' },
  { value: 'encerrada', label: 'Encerradas' },
]

export function VisualizadorConversas({ lojaId }: { lojaId: string }) {
  const [status, setStatus] = useState<FiltroStatus>('todas')
  const [busca, setBusca] = useState('')
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)

  const filtros: FiltrosConversas = {
    status: status === 'todas' ? undefined : status,
    busca: busca.trim() || undefined,
  }

  return (
    <div className="flex flex-col gap-3">
      <Banner tom="atencao">
        <span className="inline-flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-4 flex-none" aria-hidden />
          <span>
            Acesso assistido: você está vendo as conversas desta loja somente para leitura, sob consentimento. Todo
            acesso ao conteúdo é registrado e auditado.
          </span>
        </span>
      </Banner>

      <div className="flex h-[calc(100dvh-320px)] min-h-[420px] overflow-hidden rounded-card border border-linha bg-cartao">
        <Lista
          lojaId={lojaId}
          status={status}
          aoMudarStatus={setStatus}
          busca={busca}
          aoMudarBusca={setBusca}
          filtros={filtros}
          selecionadaId={selecionadaId}
          aoSelecionar={setSelecionadaId}
          className={cn('w-full md:w-[340px] md:flex-none md:border-r md:border-linha', selecionadaId && 'hidden md:flex')}
        />
        {selecionadaId ? (
          <Thread key={selecionadaId} lojaId={lojaId} conversaId={selecionadaId} aoVoltar={() => setSelecionadaId(null)} className="flex-1" />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-papel-2 px-6 text-center text-tinta-2 md:flex">
            <Eye className="size-9 text-salvia" aria-hidden />
            <p className="max-w-xs text-sm">Escolha uma conversa à esquerda para ler o histórico (somente leitura).</p>
          </div>
        )}
      </div>
    </div>
  )
}

interface ListaProps {
  lojaId: string
  status: FiltroStatus
  aoMudarStatus: (s: FiltroStatus) => void
  busca: string
  aoMudarBusca: (b: string) => void
  filtros: FiltrosConversas
  selecionadaId: string | null
  aoSelecionar: (id: string) => void
  className?: string
}

function Lista({ lojaId, status, aoMudarStatus, busca, aoMudarBusca, filtros, selecionadaId, aoSelecionar, className }: ListaProps) {
  const query = useConversasLoja(lojaId, filtros)
  const itens = query.data?.itens ?? []
  const filtrando = status !== 'todas' || busca.trim() !== ''

  return (
    <section aria-label="Conversas da loja" className={cn('flex min-h-0 flex-col bg-cartao', className)}>
      <div className="flex-none space-y-3 border-b border-linha px-3 py-3">
        <label className="relative block">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-2" />
          <Input
            type="search"
            value={busca}
            onChange={(e) => aoMudarBusca(e.target.value)}
            placeholder="Buscar por nome"
            aria-label="Buscar conversas por nome"
            className="pl-9"
          />
        </label>
        <div className="overflow-x-auto">
          <SegmentedControl value={status} onChange={aoMudarStatus} options={OPCOES_STATUS} ariaLabel="Filtrar conversas por estado" semQuebra />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending && <EsqueletoLista />}
        {query.isError && <AreaErro erro={query.error} aoTentarDeNovo={() => void query.refetch()} />}

        {query.isSuccess && itens.length === 0 && (
          <EmptyState
            className="m-4"
            icone={<MessageCircle className="size-7" aria-hidden />}
            titulo={filtrando ? 'Nenhuma conversa com esse filtro' : 'Nenhuma conversa'}
            descricao={filtrando ? 'Ajuste a busca ou o estado.' : 'Esta loja ainda não tem conversas.'}
          />
        )}

        {query.isSuccess &&
          itens.map((item) => {
            const nome = item.cliente.nome ?? item.cliente.rotulo
            const ultima = item.ultima_mensagem
            const previa = ultima ? previaLista(ultima.previa, ultima.tipo) : 'Sem mensagens ainda'
            return (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === selecionadaId ? 'true' : undefined}
                onClick={() => aoSelecionar(item.id)}
                className={cn(
                  'flex w-full items-start gap-3 border-b border-linha px-4 py-3 text-left transition-colors',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-salvia',
                  item.id === selecionadaId ? 'bg-salvia-claro shadow-[inset_3px_0_0_0_var(--cor-primaria)]' : 'hover:bg-papel-2',
                )}
              >
                <span className="mt-0.5 flex size-9 flex-none items-center justify-center rounded-full bg-salvia-claro text-sm font-bold text-salvia">
                  {inicial(nome)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-bold text-tinta">{nome}</span>
                    <span className="flex-none text-xs tabular-nums text-tinta-2">{ultima ? formatarHora(ultima.criado_em) : ''}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-tinta-2">{previa}</span>
                  <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-pill bg-papel-2 px-2 py-0.5 text-[11px] font-bold text-tinta-2">
                    {ROTULO_STATUS_CONVERSA[item.status]}
                  </span>
                </span>
              </button>
            )
          })}

        {query.data?.proximo_cursor != null && (
          <p className="px-4 py-3 text-center text-xs text-tinta-2">Mostrando as conversas mais recentes.</p>
        )}
      </div>
    </section>
  )
}

function Thread({ lojaId, conversaId, aoVoltar, className }: { lojaId: string; conversaId: string; aoVoltar: () => void; className?: string }) {
  const detalhe = useConversaLoja(lojaId, conversaId)
  const mensagens = useMensagensLoja(lojaId, conversaId)
  const lista = mensagensEmOrdem(mensagens.data?.pages)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ultimaId = lista[lista.length - 1]?.id ?? null

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [ultimaId, conversaId])

  const d = detalhe.data
  const nome = d ? (d.cliente.nome ?? d.cliente.rotulo) : detalhe.isPending ? 'Carregando…' : 'Conversa'

  return (
    <section aria-label="Conversa (somente leitura)" className={cn('flex min-h-0 flex-col bg-papel-2', className)}>
      <header className="flex flex-none items-center gap-3 border-b border-linha bg-cartao px-3 py-2.5">
        <button
          type="button"
          onClick={aoVoltar}
          aria-label="Voltar para a lista"
          className="inline-flex size-10 flex-none items-center justify-center rounded-pill text-tinta-2 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia md:hidden"
        >
          <span aria-hidden>&larr;</span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-tinta">{nome}</p>
          {d && (
            <p className="mt-0.5 text-[11px] text-tinta-2">
              {ROTULO_STATUS_CONVERSA[d.status]}
              {d.status === 'encerrada' && d.atualizado_em ? ` · encerrada em ${formatarData(d.atualizado_em)}` : ''}
            </p>
          )}
        </div>
        <span className="inline-flex flex-none items-center gap-1 rounded-pill bg-papel-2 px-2.5 py-1 text-[11px] font-bold text-tinta-2">
          <Eye className="size-3.5" aria-hidden />
          Somente leitura
        </span>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {mensagens.isPending && (
          <div className="flex h-full items-center justify-center" aria-busy="true">
            <Spinner className="size-6 text-salvia" />
          </div>
        )}
        {mensagens.isError && <AreaErro erro={mensagens.error} aoTentarDeNovo={() => void mensagens.refetch()} />}

        {mensagens.isSuccess && (
          <>
            {mensagens.hasNextPage && (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => void mensagens.fetchNextPage()}
                  disabled={mensagens.isFetchingNextPage}
                  className="inline-flex min-h-9 items-center gap-2 rounded-pill border border-linha bg-cartao px-4 text-[13px] font-bold text-tinta-2 disabled:opacity-60"
                >
                  {mensagens.isFetchingNextPage ? <Spinner /> : null}
                  Ver mensagens anteriores
                </button>
              </div>
            )}
            {lista.length === 0 ? (
              <p className="py-10 text-center text-sm text-tinta-2">Nenhuma mensagem nesta conversa.</p>
            ) : (
              <div className="space-y-1.5">
                {lista.map((m, i) => {
                  const anterior = i > 0 ? lista[i - 1] : undefined
                  return <Bolha key={m.id} mensagem={m} mostrarAutor={!anterior || anterior.autor !== m.autor} />
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Sem caixa de resposta: o visualizador e somente leitura. */}
      <div className="flex-none border-t border-linha bg-papel-2 px-4 py-3">
        <p className="text-[13px] text-tinta-2">Visualização somente leitura. Responder ao cliente é feito pela própria loja.</p>
      </div>
    </section>
  )
}

/** Uma bolha de mensagem (replica enxuta e read-only da bolha de conversas). */
function Bolha({ mensagem, mostrarAutor }: { mensagem: MensagemSaida; mostrarAutor: boolean }) {
  const { texto, placeholder } = conteudoExibido(mensagem)
  const lado = ladoDaBolha(mensagem.autor)
  const hora = formatarHora(mensagem.criado_em)

  if (lado === 'centro') {
    return (
      <div className="my-1 flex justify-center">
        <span className="max-w-[90%] rounded-pill bg-papel-2 px-3 py-1 text-center text-xs text-tinta-2">
          {texto} · {hora}
        </span>
      </div>
    )
  }

  const direita = lado === 'direita'
  const humano = mensagem.autor === 'humano'

  return (
    <div className={cn('flex', direita ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[72%]',
          direita
            ? humano
              ? 'rounded-tr-sm bg-salvia text-papel'
              : 'rounded-tr-sm bg-salvia-claro text-tinta'
            : 'rounded-tl-sm border border-linha bg-cartao text-tinta',
        )}
      >
        {direita && mostrarAutor && (
          <p className={cn('mb-0.5 text-[11px] font-bold', humano ? 'text-papel/80' : 'text-salvia')}>{ROTULO_AUTOR[mensagem.autor]}</p>
        )}
        <p className={cn('whitespace-pre-wrap break-words', placeholder && 'italic opacity-80')}>{texto}</p>
        <span className={cn('mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums', direita ? (humano ? 'text-papel/70' : 'text-tinta-2') : 'text-tinta-2')}>
          {hora}
        </span>
      </div>
    </div>
  )
}

function EsqueletoLista() {
  return (
    <div aria-busy="true" aria-label="Carregando conversas">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 border-b border-linha px-4 py-3">
          <Skeleton className="size-9 flex-none rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

function inicial(nome: string): string {
  const letra = nome.trim().charAt(0)
  return letra ? letra.toUpperCase() : '?'
}
