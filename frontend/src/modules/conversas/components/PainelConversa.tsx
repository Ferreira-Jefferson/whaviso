import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Clock, MoreHorizontal, PackageCheck } from 'lucide-react'
import type { ConversaDetalheSaida } from '@/shared/contracts/_generated/conversas'
import { ApiError } from '@/shared/api_client'
import { cn, ConfirmDialog, ErrorState, Spinner, useToast } from '@/shared/ui'
import { formatarData } from '@/shared/format'
import { useRealtime } from '@/shared/realtime'
import { useConversa, useEncerrar, useEnviarMensagem, useMensagens, mensagensEmOrdem } from '../api'
import { ROTULO_STATUS, TOM_STATUS } from '../estados'
import { Composer } from './Composer'
import { Mensagem } from './Mensagem'

const TOM_BADGE: Record<string, string> = {
  marca: 'bg-salvia-claro text-salvia',
  sucesso: 'bg-salvia-claro text-folha',
  neutro: 'bg-papel-2 text-tinta-2',
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

  return (
    <section aria-label="Conversa" className={cn('flex min-h-0 flex-col bg-papel-2', className)}>
      <Cabecalho d={d} carregando={detalhe.isPending} aoVoltar={aoVoltar} aoEncerrar={() => setConfirmarEncerrar(true)} encerrando={encerrar.isPending} />

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
                {lista.map((m) => (
                  <Mensagem key={m.id} mensagem={m} />
                ))}
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
 * O servidor rejeita responder com a conversa na automacao, com a janela de 24h fechada
 * ou com o numero indisponivel; refletimos a mesma regra antes de habilitar a caixa.
 * Assumir o atendimento (handoff da automacao para humano) e feito por outra parte do sistema.
 */
function motivoBloqueio(d: ConversaDetalheSaida): string | null {
  if (d.status === 'encerrada') return 'Esta conversa foi encerrada.'
  if (d.status === 'ia') return 'A automação está cuidando desta conversa. Para responder, o atendimento precisa ser assumido.'
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
}

function Cabecalho({ d, carregando, aoVoltar, aoEncerrar, encerrando }: CabProps) {
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

      {d && d.status !== 'encerrada' && (
        <button
          type="button"
          onClick={aoEncerrar}
          disabled={encerrando}
          className="inline-flex min-h-10 flex-none items-center gap-1.5 rounded-pill border border-linha bg-cartao px-3 text-[13px] font-bold text-tinta-2 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:opacity-60"
        >
          {encerrando ? <Spinner /> : <MoreHorizontal className="size-4" aria-hidden />}
          Encerrar
        </button>
      )}

      {d?.status === 'encerrada' && d.atualizado_em && (
        <span className="hidden flex-none text-[11px] text-tinta-2 sm:inline">Encerrada em {formatarData(d.atualizado_em)}</span>
      )}
    </header>
  )
}
