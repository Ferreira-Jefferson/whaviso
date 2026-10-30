// Casos de uma suite. Para rag_retrieval nao ha casos (usa o golden set da loja-alvo).
import { useState } from 'react'
import { ArrowLeft, ListChecks, Play, Plus } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  Skeleton,
  Switch,
  TableResponsive,
  useToast,
  type ColunaTabela,
} from '@/shared/ui'
import type { EvalCaso, EvalSuite } from '@/shared/contracts/_generated/plataforma_evals'
import { useAtualizarCaso, useCasos } from '../api'
import { ROTULO_FAMILIA, ROTULO_TIPO, TOM_FAMILIA } from '../rotulos'
import { AreaErro } from './AreaErro'
import { CasoDialog } from './CasoDialog'

/** Resumo de uma linha do que o caso pergunta (entrada.texto ou entrada.consulta). */
function resumo(c: EvalCaso): string {
  const t = c.entrada.texto ?? c.entrada.consulta
  return typeof t === 'string' ? t : ''
}

export function PainelCasos({ suite, aoVoltar, aoExecutar }: { suite: EvalSuite; aoVoltar: () => void; aoExecutar: () => void }) {
  const ehRetrieval = suite.tipo === 'rag_retrieval'
  const lista = useCasos(ehRetrieval ? null : suite.id)
  const atualizar = useAtualizarCaso(suite.id)
  const { mostrarToast } = useToast()
  const [dialogo, setDialogo] = useState<{ caso: EvalCaso | null } | null>(null)

  const colunas: ReadonlyArray<ColunaTabela<EvalCaso>> = [
    {
      chave: 'nome',
      titulo: 'Caso',
      principal: true,
      render: (c) => (
        <span className="flex flex-col">
          <span className="font-medium text-tinta">{c.nome}</span>
          <span className="line-clamp-1 text-xs text-tinta-2">{resumo(c)}</span>
        </span>
      ),
    },
    { chave: 'peso', titulo: 'Peso', render: (c) => <span className="tabular">{c.peso.toLocaleString('pt-BR')}</span> },
    { chave: 'origem', titulo: 'Origem', render: (c) => <Badge>{c.origem === 'manual' ? 'Manual' : 'Produção'}</Badge> },
    {
      chave: 'ativo',
      titulo: 'Ativo',
      render: (c) => (
        // stopPropagation: alternar nao deve abrir a edicao.
        <span onClick={(e) => e.stopPropagation()}>
          <Switch
            ligado={c.ativo}
            rotulo={`Caso ${c.nome} ativo`}
            disabled={atualizar.isPending}
            onMudar={(ativo) =>
              atualizar.mutate({ id: c.id, patch: { ativo } }, { onError: () => mostrarToast('Não foi possível alterar o caso.', { tom: 'erro' }) })
            }
          />
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variante="ghost" onClick={aoVoltar}>
          <ArrowLeft className="size-4" aria-hidden />
          Suites
        </Button>
        <div className="flex gap-2">
          <Button variante="secondary" disabled={!suite.ativo} onClick={aoExecutar}>
            <Play className="size-4" aria-hidden />
            Executar
          </Button>
          {!ehRetrieval && (
            <Button onClick={() => setDialogo({ caso: null })}>
              <Plus className="size-4" aria-hidden />
              Novo caso
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl text-salvia">{suite.nome}</h2>
        <Badge>{ROTULO_TIPO[suite.tipo]}</Badge>
        <Badge tom={TOM_FAMILIA[suite.familia]}>{ROTULO_FAMILIA[suite.familia]}</Badge>
      </div>
      {suite.descricao && <p className="text-sm text-tinta-2">{suite.descricao}</p>}

      {ehRetrieval && (
        <Banner tom="info">Esta suite usa o conjunto de perguntas e respostas de referência da loja-alvo escolhida na execução. Não há casos para adicionar aqui.</Banner>
      )}
      {!ehRetrieval && lista.isPending && (
        <div aria-busy="true" aria-label="Carregando casos" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && lista.data.length === 0 && (
        <EmptyState icone={<ListChecks className="size-7" aria-hidden />} titulo="Nenhum caso ainda" descricao="Adicione casos para esta suite medir alguma coisa." />
      )}
      {lista.isSuccess && lista.data.length > 0 && (
        <TableResponsive colunas={colunas} linhas={lista.data} chaveLinha={(c) => c.id} onRowClick={(c) => setDialogo({ caso: c })} legenda={`Casos da suite ${suite.nome}`} />
      )}
      <CasoDialog aberto={dialogo != null} aoFechar={() => setDialogo(null)} suiteId={suite.id} tipo={suite.tipo} caso={dialogo?.caso ?? null} />
    </div>
  )
}
