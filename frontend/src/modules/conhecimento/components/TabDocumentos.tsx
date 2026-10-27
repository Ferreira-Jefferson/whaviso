// Documentos da base: lista com filtros, criar, editar, aprovar, arquivar e ver versoes.
// Editar rascunho altera no lugar; editar aprovado cria uma nova versao (rascunho).
import { useState } from 'react'
import { BookOpen, History, Pencil, Plus } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  cn,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  useToast,
} from '@/shared/ui'
import { formatarDataHora } from '@/shared/format'
import type { DocumentoStatus, DocumentoTipo } from '@/shared/contracts/_generated/conhecimento'
import {
  useAtualizarDocumento,
  useCriarDocumento,
  useDocumentos,
  useMudarStatusDocumento,
  type Documento,
} from '../api'
import {
  ICONE_TIPO,
  OPCOES_TIPO,
  ROTULO_ORIGEM,
  ROTULO_STATUS,
  ROTULO_TIPO,
  TOM_STATUS,
  mensagemErro,
} from '../estados'
import { DialogDocumento, type ValoresDocumento } from './DialogDocumento'
import { DialogVersoes } from './DialogVersoes'

type FiltroStatus = DocumentoStatus | 'todos'
type FiltroTipo = DocumentoTipo | 'todos'

const OPCOES_STATUS = [
  { value: 'todos' as const, label: 'Todos os status' },
  { value: 'rascunho' as const, label: 'Rascunhos' },
  { value: 'aprovado' as const, label: 'Aprovados' },
  { value: 'arquivado' as const, label: 'Arquivados' },
]
const OPCOES_FILTRO_TIPO = [{ value: 'todos' as const, label: 'Todos os tipos' }, ...OPCOES_TIPO]

const VAZIO: ValoresDocumento = { tipo: 'faq', titulo: '', conteudo: '' }

export function TabDocumentos() {
  const { mostrarToast } = useToast()
  const [status, setStatus] = useState<FiltroStatus>('todos')
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const lista = useDocumentos({
    ...(status !== 'todos' ? { status } : {}),
    ...(tipo !== 'todos' ? { tipo } : {}),
  })
  const criar = useCriarDocumento()
  const atualizar = useAtualizarDocumento()
  const mudar = useMudarStatusDocumento()

  const [editor, setEditor] = useState<{ doc: Documento | null } | null>(null)
  const [erroEditor, setErroEditor] = useState<string | null>(null)
  const [versoes, setVersoes] = useState<Documento | null>(null)
  const [confirmar, setConfirmar] = useState<{ doc: Documento; acao: 'aprovar' | 'arquivar' } | null>(null)
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  function abrirEditor(doc: Documento | null) {
    setErroEditor(null)
    setEditor({ doc })
  }

  function salvar(v: ValoresDocumento) {
    setErroEditor(null)
    const doc = editor?.doc
    if (!doc) {
      criar.mutate(v, {
        onSuccess: () => {
          setEditor(null)
          mostrarToast('Rascunho criado.', { tom: 'sucesso' })
        },
        onError: (e) => setErroEditor(mensagemErro(e, 'Não foi possível criar o documento.')),
      })
      return
    }
    atualizar.mutate(
      { id: doc.id, body: v },
      {
        onSuccess: () => {
          setEditor(null)
          mostrarToast(doc.status === 'aprovado' ? 'Nova versão criada como rascunho.' : 'Documento salvo.', {
            tom: 'sucesso',
          })
        },
        onError: (e) => setErroEditor(mensagemErro(e, 'Não foi possível salvar o documento.')),
      },
    )
  }

  function executar() {
    if (!confirmar) return
    const { doc, acao } = confirmar
    setErroAcao(null)
    mudar.mutate(
      { id: doc.id, acao },
      {
        onSuccess: () => {
          setConfirmar(null)
          mostrarToast(acao === 'aprovar' ? 'Documento aprovado.' : 'Documento arquivado.', { tom: 'sucesso' })
        },
        onError: (e) => {
          setConfirmar(null)
          setErroAcao(mensagemErro(e, 'Não foi possível concluir a ação.'))
        },
      },
    )
  }

  const docEdicao = editor?.doc ?? null
  const inicial: ValoresDocumento = docEdicao
    ? { tipo: docEdicao.tipo, titulo: docEdicao.titulo, conteudo: docEdicao.conteudo }
    : VAZIO

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={status} onChange={setStatus} options={OPCOES_STATUS} ariaLabel="Filtrar por status" className="sm:w-44" />
          <Select value={tipo} onChange={setTipo} options={OPCOES_FILTRO_TIPO} ariaLabel="Filtrar por tipo" className="sm:w-52" />
        </div>
        <Button onClick={() => abrirEditor(null)}>
          <Plus className="size-4" aria-hidden /> Novo documento
        </Button>
      </div>

      {erroAcao && <Banner tom="erro">{erroAcao}</Banner>}

      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <ErrorState aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && lista.data.length === 0 && (
        <EmptyState
          titulo="Nenhum documento"
          descricao="Escreva o que o atendente precisa saber: como funciona a entrega, formas de pagamento, regras da casa."
          icone={<BookOpen className="size-8" strokeWidth={1.5} aria-hidden />}
          acao={<Button onClick={() => abrirEditor(null)}>Novo documento</Button>}
        />
      )}
      {lista.isSuccess && lista.data.length > 0 && (
        <>
        <p className="text-sm text-tinta-2" aria-live="polite">
          {lista.data.length} {lista.data.length === 1 ? 'documento' : 'documentos'}
        </p>
        <ul className="flex flex-col gap-2">
          {lista.data.map((d) => {
            const Icone = ICONE_TIPO[d.tipo]
            return (
            <li
              key={d.id}
              className="flex flex-col gap-3 rounded-card border border-linha bg-cartao p-4 shadow-[0_1px_2px_rgba(32,50,42,0.05)] transition-shadow hover:shadow-[0_6px_16px_-8px_rgba(32,50,42,0.18)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-input bg-salvia-claro text-salvia"
                  aria-hidden
                >
                  <Icone className="size-[18px]" strokeWidth={1.75} />
                </span>
                <h3 className="min-w-0 flex-1 truncate font-display text-base font-semibold text-tinta">{d.titulo}</h3>
                <Badge tom={TOM_STATUS[d.status]}>{ROTULO_STATUS[d.status]}</Badge>
                <Badge>{ROTULO_TIPO[d.tipo]}</Badge>
              </div>
              <p className="line-clamp-2 whitespace-pre-line text-sm text-tinta-2">{d.conteudo}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tinta-2">
                <span>
                  Versão {d.versao} · {ROTULO_ORIGEM[d.origem]} · atualizado em {formatarDataHora(d.atualizado_em)}
                </span>
                {d.status === 'aprovado' && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn('size-1.5 rounded-full', d.chunks_indexados > 0 ? 'bg-folha' : 'bg-ambar')}
                      aria-hidden
                    />
                    {d.chunks_indexados > 0 ? 'Já usado pelo atendente' : 'Aguardando o atendente ler'}
                  </span>
                )}
              </div>
              {d.duplicado_de && (
                <Banner tom="info">Outro documento ativo tem o mesmo conteúdo. Considere manter só um.</Banner>
              )}
              <div className="flex flex-wrap gap-2">
                {d.status !== 'arquivado' && (
                  <Button variante="secondary" onClick={() => abrirEditor(d)}>
                    <Pencil className="size-4" aria-hidden /> Editar
                  </Button>
                )}
                {d.status === 'rascunho' && (
                  <Button onClick={() => setConfirmar({ doc: d, acao: 'aprovar' })}>Aprovar</Button>
                )}
                {d.status !== 'arquivado' && (
                  <Button variante="ghost" onClick={() => setConfirmar({ doc: d, acao: 'arquivar' })}>
                    Arquivar
                  </Button>
                )}
                <Button variante="ghost" onClick={() => setVersoes(d)}>
                  <History className="size-4" aria-hidden /> Versões
                </Button>
              </div>
            </li>
            )
          })}
        </ul>
        </>
      )}

      <DialogDocumento
        aberto={editor !== null}
        titulo={docEdicao ? 'Editar documento' : 'Novo documento'}
        textoSalvar={docEdicao?.status === 'aprovado' ? 'Criar nova versão' : 'Salvar'}
        aviso={
          docEdicao?.status === 'aprovado'
            ? 'Este documento está aprovado. Salvar cria uma nova versão em rascunho; a atual segue valendo até você aprovar a nova.'
            : undefined
        }
        inicial={inicial}
        salvando={criar.isPending || atualizar.isPending}
        erro={erroEditor}
        onSalvar={salvar}
        onFechar={() => setEditor(null)}
      />
      <DialogVersoes documento={versoes} onFechar={() => setVersoes(null)} />
      <ConfirmDialog
        aberto={confirmar !== null}
        titulo={confirmar?.acao === 'aprovar' ? 'Aprovar documento?' : 'Arquivar documento?'}
        textoConfirmar={confirmar?.acao === 'aprovar' ? 'Aprovar' : 'Arquivar'}
        variante={confirmar?.acao === 'arquivar' ? 'destructive' : 'primary'}
        carregando={mudar.isPending}
        onConfirmar={executar}
        onCancelar={() => setConfirmar(null)}
      >
        {confirmar?.acao === 'aprovar'
          ? 'O atendente passa a usar este conteúdo nas respostas. Se houver uma versão anterior aprovada, ela é arquivada.'
          : 'O atendente deixa de usar este conteúdo. Ele continua no histórico de versões.'}
      </ConfirmDialog>
    </div>
  )
}
