// Painel do chamado selecionado (lado da loja): cabecalho com status, o fio de mensagens e a caixa
// de resposta. Quem fechou (resolvido) nao responde mais; abrir de novo = abrir outro chamado.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, CircleCheck, Send } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, cn, ConfirmDialog, ErrorState, Spinner, useToast } from '@/shared/ui'
import { formatarDataHora, formatarHora } from '@/shared/format'
import type { ChamadoMensagem } from '@/shared/contracts/_generated/suporte'
import { useChamado, useEnviarMensagem, useResolverChamado } from '../api'
import { ROTULO_STATUS, TOM_STATUS } from '../rotulos'

const MENSAGEM_MAX = 4000

interface Props {
  chamadoId: string
  aoVoltar: () => void
  className?: string
}

export function PainelChamado({ chamadoId, aoVoltar, className }: Props) {
  const ficha = useChamado(chamadoId)
  const enviar = useEnviarMensagem(chamadoId)
  const resolver = useResolverChamado()
  const { mostrarToast } = useToast()
  const [confirmarResolver, setConfirmarResolver] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const mensagens = ficha.data?.mensagens ?? []
  const ultimaId = mensagens[mensagens.length - 1]?.id ?? null
  const chamado = ficha.data?.chamado
  const resolvido = chamado?.status === 'resolvido'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [ultimaId, chamadoId])

  function aoEnviar(texto: string) {
    enviar.mutate(
      { texto },
      {
        onError: (e) =>
          mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível enviar a mensagem.', { tom: 'erro' }),
      },
    )
  }

  function aoResolver() {
    resolver.mutate(chamadoId, {
      onSuccess: () => {
        setConfirmarResolver(false)
        mostrarToast('Chamado marcado como resolvido.', { tom: 'sucesso' })
      },
      onError: (e) =>
        mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível resolver o chamado.', { tom: 'erro' }),
    })
  }

  return (
    <section aria-label="Chamado" className={cn('flex min-h-0 flex-col bg-papel-2', className)}>
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
          <p className="truncate font-bold text-tinta">{chamado?.assunto ?? (ficha.isPending ? 'Carregando…' : 'Chamado')}</p>
          {chamado && (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-tinta-2">
              <Badge tom={TOM_STATUS[chamado.status]}>{ROTULO_STATUS[chamado.status]}</Badge>
              <span>Aberto em {formatarDataHora(chamado.criado_em)}</span>
            </div>
          )}
        </div>
        {chamado && !resolvido && (
          <button
            type="button"
            onClick={() => setConfirmarResolver(true)}
            disabled={resolver.isPending}
            className="inline-flex min-h-10 flex-none items-center gap-1.5 rounded-pill border border-linha bg-cartao px-3 text-[13px] font-bold text-tinta-2 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:opacity-60"
          >
            {resolver.isPending ? <Spinner /> : <CircleCheck className="size-4" aria-hidden />}
            Marcar resolvido
          </button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {ficha.isPending && (
          <div className="flex h-full items-center justify-center" aria-busy="true">
            <Spinner className="size-6 text-salvia" />
          </div>
        )}
        {ficha.isError && <ErrorState aoTentarDeNovo={() => void ficha.refetch()} />}

        {ficha.isSuccess && (
          mensagens.length === 0 ? (
            <p className="py-10 text-center text-sm text-tinta-2">Nenhuma mensagem neste chamado ainda.</p>
          ) : (
            <div className="space-y-1.5">
              {mensagens.map((m) => (
                <BolhaMensagem key={m.id} mensagem={m} />
              ))}
            </div>
          )
        )}
      </div>

      {chamado && (
        resolvido ? (
          <div className="flex-none border-t border-linha bg-papel-2 px-4 py-3">
            <p className="text-[13px] text-tinta-2">
              Este chamado foi resolvido. Se precisar de mais ajuda, abra um novo chamado.
            </p>
          </div>
        ) : (
          <Composer aoEnviar={aoEnviar} enviando={enviar.isPending} />
        )
      )}

      <ConfirmDialog
        aberto={confirmarResolver}
        titulo="Marcar como resolvido?"
        textoConfirmar="Marcar resolvido"
        carregando={resolver.isPending}
        onConfirmar={aoResolver}
        onCancelar={() => setConfirmarResolver(false)}
      >
        O chamado é encerrado. Você pode abrir um novo chamado quando precisar.
      </ConfirmDialog>
    </section>
  )
}

/** Uma bolha: a loja sai pela direita; a equipe Whaviso entra pela esquerda. */
function BolhaMensagem({ mensagem }: { mensagem: ChamadoMensagem }) {
  const daLoja = mensagem.autor_tipo === 'loja'
  const hora = formatarHora(mensagem.criado_em)
  return (
    <div className={cn('flex', daLoja ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[72%]',
          daLoja ? 'rounded-tr-sm bg-salvia text-papel' : 'rounded-tl-sm border border-linha bg-cartao text-tinta',
        )}
      >
        <p className={cn('mb-0.5 text-[11px] font-bold', daLoja ? 'text-papel/80' : 'text-salvia')}>
          {daLoja ? 'Você' : 'Equipe Whaviso'}
        </p>
        <p className="whitespace-pre-wrap break-words">{mensagem.texto}</p>
        <span
          className={cn('mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums', daLoja ? 'text-papel/70' : 'text-tinta-2')}
        >
          {hora}
        </span>
      </div>
    </div>
  )
}

/** Caixa de resposta do chamado (Enter envia; Shift+Enter quebra linha). */
function Composer({ aoEnviar, enviando }: { aoEnviar: (texto: string) => void; enviando: boolean }) {
  const [texto, setTexto] = useState('')
  const limpo = texto.trim()
  const podeEnviar = limpo.length > 0 && limpo.length <= MENSAGEM_MAX && !enviando

  function enviar() {
    if (!podeEnviar) return
    aoEnviar(limpo)
    setTexto('')
  }

  function aoSubmeter(e: FormEvent) {
    e.preventDefault()
    enviar()
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <form onSubmit={aoSubmeter} className="flex-none border-t border-linha bg-cartao px-3 py-2.5">
      <div className="flex items-end gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, MENSAGEM_MAX))}
          onKeyDown={aoTeclar}
          rows={1}
          placeholder="Escreva uma mensagem"
          aria-label="Mensagem para a equipe Whaviso"
          className="max-h-32 min-h-11 w-full flex-1 resize-none rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta [field-sizing:content] placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
        />
        <button
          type="submit"
          disabled={!podeEnviar}
          aria-label="Enviar mensagem"
          className="inline-flex size-11 flex-none items-center justify-center rounded-pill bg-salvia text-papel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:cursor-not-allowed disabled:bg-salvia/50"
        >
          {enviando ? <Spinner className="text-papel" /> : <Send className="size-5" aria-hidden />}
        </button>
      </div>
    </form>
  )
}
