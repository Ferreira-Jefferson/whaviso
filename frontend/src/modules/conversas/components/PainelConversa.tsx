import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, CircleCheck, Clock, PackageCheck, Undo2, UserPlus } from 'lucide-react'
import type { ConversaDetalheSaida } from '@/shared/contracts/_generated/conversas'
import { ApiError } from '@/shared/api_client'
import { cn, ConfirmDialog, ErrorState, Spinner, useToast } from '@/shared/ui'
import { formatarData } from '@/shared/format'
import { useRealtime } from '@/shared/realtime'
import {
  useAssumir,
  useConversa,
  useDevolver,
  useEncerrar,
  useEnviarMensagem,
  useMensagens,
  mensagensEmOrdem,
} from '../api'
import { ROTULO_STATUS, TOM_STATUS } from '../estados'
import { Composer } from './Composer'
import { Mensagem } from './Mensagem'

const TOM_BADGE: Record<string, string> = {
  marca: 'bg-salvia-claro text-salvia',
  sucesso: 'bg-salvia-claro text-folha',
  atencao: 'bg-dourado-claro text-barro',
  erro: 'bg-papel-2 text-barro',
  neutro: 'bg-papel-2 text-tinta-2',
}

/** A conversa pode ser assumida por um humano: automacao, aguardando, ou humano sem dono. */
function podeAssumir(d: ConversaDetalheSaida): boolean {
  if (d.status === 'ia' || d.status === 'aguardando') return true
  return d.status === 'humano' && !d.tem_atendente
}

/** Eu sou o atendente responsavel por esta conversa (posso responder e devolver). */
function minhaConversa(d: ConversaDetalheSaida): boolean {
  return d.status === 'humano' && d.atendido_por_mim
}

interface Props {
  conversaId: string
  aoVoltar: () => void
  className?: string
}

/** Painel da conversa selecionada: cabecalho, historico ao vivo e caixa de resposta. */
export function PainelConversa({ conversaId, aoVoltar, className }: Props) {
  const detalhe = useConversa(conversaId)
  const mensagens = useMensagens(conversaId)
  const enviar = useEnviarMensagem(conversaId)
  const encerrar = useEncerrar()
  const assumir = useAssumir()
  const devolver = useDevolver()
  const { mostrarToast } = useToast()
  const [confirmarEncerrar, setConfirmarEncerrar] = useState(false)

  const lista = mensagensEmOrdem(mensagens.data?.pages)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ultimaId = lista[lista.length - 1]?.id ?? null

  // Rola para o fim quando chega mensagem nova ou ao abrir a conversa.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [ultimaId, conversaId])

  // Evento ao vivo desta conversa: a invalidacao de ['conversas'] ja recarrega; aqui so avisamos.
  useRealtime(
    'conversa.mensagem',
    useCallback(
      (e) => {
        if (e.payload['conversa_id'] !== conversaId) return
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
      },
      [conversaId],
    ),
  )

  const d = detalhe.data

  const aoEnviar = useCallback(
    (texto: string) => {
      enviar.mutate(texto, {
        onError: (err) =>
          mostrarToast(err instanceof ApiError ? err.message : 'Não foi possível enviar a mensagem.', { tom: 'erro' }),
      })
    },
    [enviar, mostrarToast],
  )

  const aoEncerrar = useCallback(() => {
    encerrar.mutate(conversaId, {
      onSuccess: () => {
        setConfirmarEncerrar(false)
        mostrarToast('Atendimento encerrado.', { tom: 'sucesso' })
      },
      onError: (err) =>
        mostrarToast(err instanceof ApiError ? err.message : 'Não foi possível encerrar.', { tom: 'erro' }),
    })
  }, [encerrar, conversaId, mostrarToast])

  const aoAssumir = useCallback(() => {
    assumir.mutate(conversaId, {
      onSuccess: () => mostrarToast('Você assumiu o atendimento.', { tom: 'sucesso' }),
      onError: (err) =>
        mostrarToast(err instanceof ApiError ? err.message : 'Não foi possível assumir o atendimento.', { tom: 'erro' }),
    })
  }, [assumir, conversaId, mostrarToast])

  const aoDevolver = useCallback(() => {
    devolver.mutate(conversaId, {
      onSuccess: () => mostrarToast('Atendimento devolvido para a automação.', { tom: 'sucesso' }),
      onError: (err) =>
        mostrarToast(err instanceof ApiError ? err.message : 'Não foi possível devolver o atendimento.', { tom: 'erro' }),
    })
  }, [devolver, conversaId, mostrarToast])

  return (
    <section aria-label="Conversa" className={cn('flex min-h-0 flex-col bg-papel-2', className)}>
      <Cabecalho
        d={d}
        carregando={detalhe.isPending}
        aoVoltar={aoVoltar}
        aoEncerrar={() => setConfirmarEncerrar(true)}
        encerrando={encerrar.isPending}
        aoAssumir={aoAssumir}
        assumindo={assumir.isPending}
        aoDevolver={aoDevolver}
        devolvendo={devolver.isPending}
      />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {mensagens.isPending && (
          <div className="flex h-full items-center justify-center" aria-busy="true">
            <Spinner className="size-6 text-salvia" />
          </div>
        )}
        {mensagens.isError && <ErrorState aoTentarDeNovo={() => void mensagens.refetch()} />}

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
              <p className="py-10 text-center text-sm text-tinta-2">Nenhuma mensagem nesta conversa ainda.</p>
            ) : (
              <div className="space-y-1.5">
                {lista.map((m, i) => {
                  const anterior = i > 0 ? lista[i - 1] : undefined
                  return <Mensagem key={m.id} mensagem={m} mostrarAutor={!anterior || anterior.autor !== m.autor} />
                })}
              </div>
            )}
          </>
        )}
      </div>

      {d && <Composer aoEnviar={aoEnviar} enviando={enviar.isPending} bloqueio={motivoBloqueio(d)} />}

      <ConfirmDialog
        aberto={confirmarEncerrar}
        titulo="Encerrar atendimento?"
        variante="destructive"
        textoConfirmar="Encerrar"
        carregando={encerrar.isPending}
        onConfirmar={aoEncerrar}
        onCancelar={() => setConfirmarEncerrar(false)}
      >
        A conversa sai da fila de atendimento. O cliente ainda pode escrever de novo e abrir uma nova conversa.
      </ConfirmDialog>
    </section>
  )
}

/**
 * Por que a caixa de resposta esta bloqueada (ou null se da para responder).
 * So quem assumiu o atendimento responde: a caixa abre apenas quando a conversa esta em
 * 'humano' sob a minha responsabilidade, a janela de 24h esta aberta e o numero conectado.
 * Espelhamos os 409/403 da api (conversa_com_ia, janela_fechada, numero_indisponivel,
 * nao_e_o_atendente) antes de habilitar.
 */
function motivoBloqueio(d: ConversaDetalheSaida): string | null {
  if (d.status === 'encerrada') return 'Esta conversa foi encerrada.'
  if (podeAssumir(d)) return 'Assuma o atendimento para responder ao cliente.'
  if (!minhaConversa(d)) return 'Esta conversa está com outro atendente.'
  if (d.numero_whatsapp.status !== 'conectado') return 'O número de WhatsApp desta loja está indisponível no momento.'
  if (!d.janela_aberta) return 'A janela de 24h está fechada. O cliente precisa escrever de novo para liberar a resposta livre.'
  return null
}

interface CabProps {
  d: ConversaDetalheSaida | undefined
  carregando: boolean
  aoVoltar: () => void
  aoEncerrar: () => void
  encerrando: boolean
  aoAssumir: () => void
  assumindo: boolean
  aoDevolver: () => void
  devolvendo: boolean
}

function Cabecalho({ d, carregando, aoVoltar, aoEncerrar, encerrando, aoAssumir, assumindo, aoDevolver, devolvendo }: CabProps) {
  const nome = d ? (d.cliente.nome ?? d.cliente.rotulo) : carregando ? 'Carregando…' : 'Conversa'
  return (
    <header className="flex flex-none items-center gap-3 border-b border-linha bg-cartao px-3 py-2.5">
      <button
        type="button"
        onClick={aoVoltar}
        aria-label="Voltar para a lista"
        className="inline-flex size-10 flex-none items-center justify-center rounded-pill text-tinta-2 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia md:hidden"
      >
        <ArrowLeft className="size-5" aria-hidden />
      </button>

      {d && (
        <span
          aria-hidden
          className="flex size-9 flex-none items-center justify-center rounded-full bg-salvia-claro text-sm font-bold text-salvia"
        >
          {inicial(nome)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-tinta">{nome}</p>
        {d && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
            <span className={cn('inline-flex items-center rounded-pill px-2 py-0.5 font-bold', TOM_BADGE[TOM_STATUS[d.status]])}>
              {ROTULO_STATUS[d.status]}
            </span>
            {d.status !== 'encerrada' && (
              <span className={cn('inline-flex items-center gap-1 text-tinta-2', !d.janela_aberta && 'text-barro')}>
                <Clock className="size-3" aria-hidden />
                {d.janela_aberta ? 'Janela de 24h aberta' : 'Janela de 24h fechada'}
              </span>
            )}
            {d.pedido_ligado && (
              <span className="inline-flex items-center gap-1 text-tinta-2">
                <PackageCheck className="size-3" aria-hidden />
                Pedido {d.pedido_ligado.codigo}
              </span>
            )}
          </div>
        )}
      </div>

      {d && podeAssumir(d) && (
        <button
          type="button"
          onClick={aoAssumir}
          disabled={assumindo}
          className="inline-flex min-h-10 flex-none items-center gap-1.5 rounded-pill bg-salvia px-3.5 text-[13px] font-bold text-papel hover:bg-salvia/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:opacity-60"
        >
          {assumindo ? <Spinner className="text-papel" /> : <UserPlus className="size-4" aria-hidden />}
          Assumir atendimento
        </button>
      )}

      {d && minhaConversa(d) && (
        <button
          type="button"
          onClick={aoDevolver}
          disabled={devolvendo}
          className="inline-flex min-h-10 flex-none items-center gap-1.5 rounded-pill border border-linha bg-cartao px-3 text-[13px] font-bold text-tinta-2 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:opacity-60"
        >
          {devolvendo ? <Spinner /> : <Undo2 className="size-4" aria-hidden />}
          Devolver
        </button>
      )}

      {d && d.status !== 'encerrada' && (
        <button
          type="button"
          onClick={aoEncerrar}
          disabled={encerrando}
          className="inline-flex min-h-10 flex-none items-center gap-1.5 rounded-pill border border-linha bg-cartao px-3 text-[13px] font-bold text-tinta-2 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:opacity-60"
        >
          {encerrando ? <Spinner /> : <CircleCheck className="size-4" aria-hidden />}
          Encerrar
        </button>
      )}

      {d?.status === 'encerrada' && d.atualizado_em && (
        <span className="hidden flex-none text-[11px] text-tinta-2 sm:inline">Encerrada em {formatarData(d.atualizado_em)}</span>
      )}
    </header>
  )
}

function inicial(nome: string): string {
  const letra = nome.trim().charAt(0)
  return letra ? letra.toUpperCase() : '?'
}
