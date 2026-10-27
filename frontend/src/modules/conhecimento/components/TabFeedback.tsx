// Triagem da realimentacao: o atendente registra lacunas, perguntas repetidas e correcoes da equipe.
// Fluxo: novo -> em analise (triar) -> virou documento (promover, o dono escreve o texto) | descartado.
// O texto cru da conversa nunca vira documento sozinho.
import { useState } from 'react'
import { Inbox } from 'lucide-react'
import { Badge, Banner, Button, EmptyState, ErrorState, Select, Skeleton, useToast } from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { RagFeedbackStatus } from '@/shared/contracts/_generated/conhecimento'
import { usePromoverFeedback, useFeedback, useTriarFeedback, type Feedback } from '../api'
import { ROTULO_FEEDBACK_STATUS, ROTULO_FEEDBACK_TIPO, TOM_FEEDBACK, mensagemErro } from '../estados'
import { DialogDocumento, type ValoresDocumento } from './DialogDocumento'

type Filtro = RagFeedbackStatus | 'todos'
const OPCOES: { value: Filtro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'novo', label: 'Novos' },
  { value: 'triado', label: 'Em análise' },
  { value: 'promovido', label: 'Viraram documento' },
  { value: 'descartado', label: 'Descartados' },
]

export function TabFeedback() {
  const { mostrarToast } = useToast()
  const [filtro, setFiltro] = useState<Filtro>('novo')
  const lista = useFeedback(filtro === 'todos' ? undefined : filtro)
  const triar = useTriarFeedback()
  const promover = usePromoverFeedback()
  const [alvo, setAlvo] = useState<Feedback | null>(null)
  const [erroPromover, setErroPromover] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function acao(f: Feedback, a: 'triar' | 'descartar') {
    setErro(null)
    triar.mutate(
      { id: f.id, acao: a },
      {
        onSuccess: () => mostrarToast(a === 'triar' ? 'Movido para análise.' : 'Sugestão descartada.', { tom: 'sucesso' }),
        onError: (e) => setErro(mensagemErro(e, 'Não foi possível atualizar a sugestão.')),
      },
    )
  }

  function salvarPromocao(v: ValoresDocumento) {
    if (!alvo) return
    setErroPromover(null)
    promover.mutate(
      { id: alvo.id, body: v },
      {
        onSuccess: () => {
          setAlvo(null)
          mostrarToast('Rascunho criado. Revise e aprove em Documentos.', { tom: 'sucesso' })
        },
        onError: (e) => setErroPromover(mensagemErro(e, 'Não foi possível criar o documento.')),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-tinta-2">
          Situações em que o atendente não soube responder ou a equipe corrigiu. Transforme as boas em documentos.
        </p>
        <Select value={filtro} onChange={setFiltro} options={OPCOES} ariaLabel="Filtrar sugestões" className="sm:w-52" />
      </div>

      {erro && <Banner tom="erro">{erro}</Banner>}

      {lista.isPending && <Skeleton className="h-24 w-full" />}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && lista.data.length === 0 && (
        <EmptyState
          titulo="Nada por aqui"
          descricao="Quando o atendente encontrar lacunas na base, elas aparecem para você triar."
          icone={<Inbox className="size-8" strokeWidth={1.5} aria-hidden />}
        />
      )}
      {lista.isSuccess && lista.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lista.data.map((f) => (
            <li key={f.id} className="flex flex-col gap-3 rounded-card border border-linha bg-cartao p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tom="marca">{ROTULO_FEEDBACK_TIPO[f.tipo]}</Badge>
                <Badge tom={TOM_FEEDBACK[f.status]}>{ROTULO_FEEDBACK_STATUS[f.status]}</Badge>
                {f.ocorrencias > 1 && <Badge>{f.ocorrencias} ocorrências</Badge>}
                <span className="text-xs text-tinta-2">{formatarDataHora(f.criado_em)}</span>
              </div>
              <p className="whitespace-pre-line text-sm text-tinta">{f.texto}</p>
              {(f.status === 'novo' || f.status === 'triado') && (
                <div className="flex flex-wrap gap-2">
                  {f.status === 'novo' && (
                    <Button variante="secondary" disabled={triar.isPending} onClick={() => acao(f, 'triar')}>
                      Analisar
                    </Button>
                  )}
                  {f.status === 'triado' && (
                    <Button
                      onClick={() => {
                        setErroPromover(null)
                        setAlvo(f)
                      }}
                    >
                      Virar documento
                    </Button>
                  )}
                  <Button variante="ghost" disabled={triar.isPending} onClick={() => acao(f, 'descartar')}>
                    Descartar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <DialogDocumento
        aberto={alvo !== null}
        titulo="Virar documento"
        textoSalvar="Criar rascunho"
        aviso="Escreva o documento com suas palavras: o texto da conversa não entra sozinho. Sem preço, telefone ou Pix."
        inicial={{ tipo: 'faq', titulo: '', conteudo: '' }}
        salvando={promover.isPending}
        erro={erroPromover}
        onSalvar={salvarPromocao}
        onFechar={() => setAlvo(null)}
      />
    </div>
  )
}
