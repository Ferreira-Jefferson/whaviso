// Golden set: perguntas de teste com a resposta esperada e os documentos que deveriam embasa-la.
// Servem para medir se o atendente acerta. Remover = desativar (sem DELETE no backend).
import { useState, type FormEvent } from 'react'
import { ClipboardCheck, Plus } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  useToast,
} from '@/shared/ui'
import { AvaliacaoCriar, type DocumentoTipo } from '@/shared/contracts/_generated/conhecimento'
import { useAtualizarAvaliacao, useAvaliacoes, useCriarAvaliacao, useDocumentos } from '../api'
import { OPCOES_TIPO, ROTULO_TIPO, mensagemErro } from '../estados'
import { Textarea } from './Textarea'

const OPCOES_TIPO_ESPERADO = [{ value: 'nenhum' as const, label: 'Qualquer tipo' }, ...OPCOES_TIPO]

export function TabAvaliacao() {
  const { mostrarToast } = useToast()
  const lista = useAvaliacoes()
  const criar = useCriarAvaliacao()
  const atualizar = useAtualizarAvaliacao()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function alternar(id: string, ativo: boolean) {
    atualizar.mutate(
      { id, body: { ativo } },
      {
        onSuccess: () => mostrarToast(ativo ? 'Pergunta reativada.' : 'Pergunta desativada.', { tom: 'sucesso' }),
        onError: (e) => mostrarToast(mensagemErro(e, 'Não foi possível atualizar.'), { tom: 'erro' }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-tinta-2">
          Perguntas que o atendente deve saber responder. Use para conferir a base depois de mudar documentos.
        </p>
        <Button
          onClick={() => {
            setErro(null)
            setAberto(true)
          }}
          className="shrink-0"
        >
          <Plus className="size-4" aria-hidden /> Nova pergunta
        </Button>
      </div>

      {lista.isPending && <Skeleton className="h-24 w-full" />}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && lista.data.length === 0 && (
        <EmptyState
          titulo="Nenhuma pergunta de teste"
          descricao="Cadastre perguntas reais de clientes e a resposta esperada para acompanhar a qualidade do atendente."
          icone={<ClipboardCheck className="size-8" strokeWidth={1.5} aria-hidden />}
        />
      )}
      {lista.isSuccess && lista.data.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lista.data.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-card border border-linha bg-cartao p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 font-medium text-tinta">{a.pergunta}</p>
                {a.tipo && <Badge>{ROTULO_TIPO[a.tipo]}</Badge>}
                <Badge tom={a.ativo ? 'sucesso' : 'neutro'}>{a.ativo ? 'Ativa' : 'Desativada'}</Badge>
              </div>
              {a.resposta_esperada && (
                <p className="whitespace-pre-line text-sm text-tinta-2">
                  <span className="font-medium text-tinta">Resposta esperada: </span>
                  {a.resposta_esperada}
                </p>
              )}
              <p className="text-xs text-tinta-2">
                {a.docs_esperados.length === 0
                  ? 'Sem documento indicado.'
                  : `${a.docs_esperados.length} documento(s) esperado(s).`}
              </p>
              <div>
                <Button variante="ghost" disabled={atualizar.isPending} onClick={() => alternar(a.id, !a.ativo)}>
                  {a.ativo ? 'Desativar' : 'Reativar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog aberto={aberto} onFechar={() => setAberto(false)} titulo="Nova pergunta de teste" className="sm:max-w-xl">
        {aberto && (
          <FormAvaliacao
            salvando={criar.isPending}
            erro={erro}
            onFechar={() => setAberto(false)}
            onSalvar={(corpo) => {
              setErro(null)
              criar.mutate(corpo, {
                onSuccess: () => {
                  setAberto(false)
                  mostrarToast('Pergunta cadastrada.', { tom: 'sucesso' })
                },
                onError: (e) => setErro(mensagemErro(e, 'Não foi possível cadastrar a pergunta.')),
              })
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

function FormAvaliacao({
  salvando,
  erro,
  onSalvar,
  onFechar,
}: {
  salvando: boolean
  erro: string | null
  onSalvar: (c: AvaliacaoCriar) => void
  onFechar: () => void
}) {
  const [pergunta, setPergunta] = useState('')
  const [resposta, setResposta] = useState('')
  const [tipo, setTipo] = useState<DocumentoTipo | 'nenhum'>('nenhum')
  const [docs, setDocs] = useState<string[]>([])
  const [local, setLocal] = useState<string | null>(null)
  const aprovados = useDocumentos({ status: 'aprovado' })

  function enviar(e: FormEvent) {
    e.preventDefault()
    const r = AvaliacaoCriar.safeParse({
      pergunta,
      resposta_esperada: resposta.trim() || null,
      docs_esperados: docs,
      tipo: tipo === 'nenhum' ? null : tipo,
    })
    if (!r.success) {
      setLocal('A pergunta precisa ter pelo menos 3 caracteres (até 500) e a resposta até 2000.')
      return
    }
    setLocal(null)
    onSalvar(r.data)
  }

  function alternarDoc(id: string) {
    setDocs((d) => (d.includes(id) ? d.filter((x) => x !== id) : d.length < 20 ? [...d, id] : d))
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4 text-tinta">
      <Field label="Pergunta do cliente">
        <Input value={pergunta} maxLength={500} onChange={(e) => setPergunta(e.target.value)} />
      </Field>
      <Field label="Resposta esperada (opcional)">
        <Textarea rows={4} value={resposta} maxLength={2000} onChange={(e) => setResposta(e.target.value)} />
      </Field>
      <Field label="Tipo de documento esperado">
        <Select value={tipo} onChange={setTipo} options={OPCOES_TIPO_ESPERADO} ariaLabel="Tipo esperado" />
      </Field>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium text-tinta">Documentos que embasam a resposta</legend>
        {aprovados.isSuccess && aprovados.data.length === 0 && (
          <p className="text-sm text-tinta-2">Nenhum documento aprovado ainda.</p>
        )}
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {aprovados.data?.map((d) => (
            <label key={d.id} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={docs.includes(d.id)} onChange={() => alternarDoc(d.id)} className="size-4 accent-salvia" />
              <span className="min-w-0 truncate">{d.titulo}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {(local ?? erro) && <Banner tom="erro">{local ?? erro}</Banner>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variante="secondary" onClick={onFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando}>
          Cadastrar
        </Button>
      </div>
    </form>
  )
}
