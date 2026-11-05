// Painel do chamado no console: cabecalho + fio de mensagens + caixa de resposta do operador, e o
// bloco de CONSENTIMENTO: mostra se a loja do chamado concedeu acesso assistido ativo. Com acesso
// ativo, libera o VISUALIZADOR READ-ONLY de conversas da loja; sem acesso, orienta a pedir ao
// cliente. Nenhuma acao de escrita sobre conteudo da loja mora aqui (so a resposta ao chamado).
import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, Eye, EyeOff, Send, ShieldCheck } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, cn, Skeleton, Spinner, useToast } from '@/shared/ui'
import { formatarDataHora, formatarHora } from '@/shared/format'
import type { ChamadoMensagem } from '@/shared/contracts/_generated/suporte'
import { useAcessosLoja, useChamado, useResponder } from '../api'
import { AreaErro } from './AreaErro'
import { VisualizadorConversas } from './VisualizadorConversas'
import { ROTULO_STATUS, TOM_STATUS } from '../rotulos'

const MENSAGEM_MAX = 4000

interface Props {
  chamadoId: string
  aoVoltar: () => void
  className?: string
}

export function PainelChamado({ chamadoId, aoVoltar, className }: Props) {
  const ficha = useChamado(chamadoId)
  const responder = useResponder(chamadoId)
  const { mostrarToast } = useToast()
  const [verConversas, setVerConversas] = useState(false)

  const chamado = ficha.data?.chamado
  const mensagens = ficha.data?.mensagens ?? []
  const lojaId = chamado?.loja_id ?? null

  function aoResponder(texto: string) {
    responder.mutate(
      { texto },
      {
        onError: (e) =>
          mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível enviar a resposta.', { tom: 'erro' }),
      },
    )
  }

  return (
    <section aria-label="Chamado" className={cn('flex min-h-0 flex-col', className)}>
      <header className="flex flex-none items-center gap-3 border-b border-linha bg-cartao px-3 py-2.5">
        <button
          type="button"
          onClick={aoVoltar}
          aria-label="Voltar para a fila"
          className="inline-flex size-10 flex-none items-center justify-center rounded-pill text-tinta-2 hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia lg:hidden"
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
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {ficha.isPending && (
          <div className="flex h-full items-center justify-center" aria-busy="true">
            <Spinner className="size-6 text-salvia" />
          </div>
        )}
        {ficha.isError && <AreaErro erro={ficha.error} aoTentarDeNovo={() => void ficha.refetch()} />}

        {ficha.isSuccess && chamado && (
          <div className="flex flex-col gap-4 px-4 py-4">
            <div className="space-y-1.5">
              {mensagens.length === 0 ? (
                <p className="py-6 text-center text-sm text-tinta-2">Nenhuma mensagem neste chamado ainda.</p>
              ) : (
                mensagens.map((m) => <BolhaMensagem key={m.id} mensagem={m} />)
              )}
            </div>

            {lojaId && (
              <ConsentimentoEConversas
                lojaId={lojaId}
                verConversas={verConversas}
                aoAlternar={() => setVerConversas((v) => !v)}
              />
            )}
          </div>
        )}
      </div>

      {chamado && <Composer aoEnviar={aoResponder} enviando={responder.isPending} />}
    </section>
  )
}

/** Bloco de consentimento + (quando ativo) o visualizador de conversas da loja. */
function ConsentimentoEConversas({
  lojaId,
  verConversas,
  aoAlternar,
}: {
  lojaId: string
  verConversas: boolean
  aoAlternar: () => void
}) {
  const acessos = useAcessosLoja(lojaId)
  const ativo = useMemo(() => acessos.data?.itens.find((a) => a.ativo) ?? null, [acessos.data])

  return (
    <div className="rounded-card border border-linha bg-cartao p-4">
      <div className="flex items-start gap-2.5">
        <ShieldCheck strokeWidth={1.75} className="mt-0.5 size-5 flex-none text-salvia" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-tinta">Acesso assistido</h3>

          {acessos.isPending && <Skeleton className="mt-2 h-4 w-48" />}
          {acessos.isError && <AreaErro erro={acessos.error} aoTentarDeNovo={() => void acessos.refetch()} />}

          {acessos.isSuccess && (
            ativo ? (
              <>
                <p className="mt-1 text-sm text-tinta-2">
                  A loja concedeu acesso às conversas até {formatarDataHora(ativo.expira_em)}. A leitura é somente leitura e
                  fica registrada (auditada).
                </p>
                <button
                  type="button"
                  onClick={aoAlternar}
                  className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-pill bg-salvia px-4 text-[13px] font-bold text-papel hover:bg-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
                >
                  {verConversas ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                  {verConversas ? 'Ocultar conversas' : 'Ver conversas da loja'}
                </button>
              </>
            ) : (
              <Banner tom="atencao" className="mt-2">
                Sem acesso assistido ativo. Peça ao cliente para conceder o acesso pela tela de Suporte da loja (aba
                "Acesso da equipe") para você poder ver as conversas.
              </Banner>
            )
          )}
        </div>
      </div>

      {acessos.isSuccess && ativo && verConversas && (
        <div className="mt-4 border-t border-linha pt-4">
          <VisualizadorConversas lojaId={lojaId} />
        </div>
      )}
    </div>
  )
}

/** Uma bolha: o operador (equipe) sai pela direita; a loja entra pela esquerda. */
function BolhaMensagem({ mensagem }: { mensagem: ChamadoMensagem }) {
  const doOperador = mensagem.autor_tipo === 'operador'
  const hora = formatarHora(mensagem.criado_em)
  return (
    <div className={cn('flex', doOperador ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[72%]',
          doOperador ? 'rounded-tr-sm bg-salvia text-papel' : 'rounded-tl-sm border border-linha bg-cartao text-tinta',
        )}
      >
        <p className={cn('mb-0.5 text-[11px] font-bold', doOperador ? 'text-papel/80' : 'text-salvia')}>
          {doOperador ? 'Você (equipe)' : 'Loja'}
        </p>
        <p className="whitespace-pre-wrap break-words">{mensagem.texto}</p>
        <span className={cn('mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums', doOperador ? 'text-papel/70' : 'text-tinta-2')}>
          {hora}
        </span>
      </div>
    </div>
  )
}

/** Caixa de resposta do operador (Enter envia; Shift+Enter quebra linha). */
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
          placeholder="Responder ao chamado"
          aria-label="Resposta ao chamado"
          className="max-h-32 min-h-11 w-full flex-1 resize-none rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta [field-sizing:content] placeholder:text-tinta-2/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
        />
        <button
          type="submit"
          disabled={!podeEnviar}
          aria-label="Enviar resposta"
          className="inline-flex size-11 flex-none items-center justify-center rounded-pill bg-salvia text-papel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia disabled:cursor-not-allowed disabled:bg-salvia/50"
        >
          {enviando ? <Spinner className="text-papel" /> : <Send className="size-5" aria-hidden />}
        </button>
      </div>
    </form>
  )
}
