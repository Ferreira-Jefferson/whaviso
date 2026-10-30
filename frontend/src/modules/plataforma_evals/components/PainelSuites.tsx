// Lista de suites: tipo e familia em selos, ativar/desativar, editar, abrir os casos e disparar
// uma execucao. O clique na linha abre os casos da suite.
import { useState } from 'react'
import { FlaskConical, Pencil, Play, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Switch,
  TableResponsive,
  useToast,
  type ColunaTabela,
} from '@/shared/ui'
import type { EvalSuite } from '@/shared/contracts/_generated/plataforma_evals'
import { useAtualizarSuite, useSuites } from '../api'
import { ROTULO_FAMILIA, ROTULO_TIPO, TOM_FAMILIA } from '../rotulos'
import { AreaErro } from './AreaErro'
import { SuiteDialog } from './SuiteDialog'

export function PainelSuites({
  aoAbrirCasos,
  aoExecutar,
}: {
  aoAbrirCasos: (suite: EvalSuite) => void
  aoExecutar: (suite: EvalSuite) => void
}) {
  const lista = useSuites()
  const atualizar = useAtualizarSuite()
  const { mostrarToast } = useToast()
  const [dialogo, setDialogo] = useState<{ suite: EvalSuite | null } | null>(null)

  const alternar = (s: EvalSuite, ativo: boolean) =>
    atualizar.mutate(
      { id: s.id, patch: { ativo } },
      { onError: () => mostrarToast('Não foi possível alterar a suite.', { tom: 'erro' }) },
    )

  const colunas: ReadonlyArray<ColunaTabela<EvalSuite>> = [
    {
      chave: 'nome',
      titulo: 'Suite',
      principal: true,
      render: (s) => (
        <span className="flex flex-col">
          <span className="font-medium text-tinta">{s.nome}</span>
          {s.descricao && <span className="line-clamp-1 text-xs text-tinta-2">{s.descricao}</span>}
        </span>
      ),
    },
    { chave: 'tipo', titulo: 'Tipo', render: (s) => <Badge tom="neutro">{ROTULO_TIPO[s.tipo]}</Badge> },
    { chave: 'familia', titulo: 'Família', render: (s) => <Badge tom={TOM_FAMILIA[s.familia]}>{ROTULO_FAMILIA[s.familia]}</Badge> },
    {
      chave: 'ativo',
      titulo: 'Ativa',
      render: (s) => (
        // stopPropagation: alternar nao deve abrir os casos.
        <span onClick={(e) => e.stopPropagation()}>
          <Switch ligado={s.ativo} rotulo={`Suite ${s.nome} ativa`} disabled={atualizar.isPending} onMudar={(v) => alternar(s, v)} />
        </span>
      ),
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      ocultarRotuloMobile: true,
      alinhar: 'direita',
      render: (s) => (
        <span className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          <Button variante="secondary" tamanho="icone" aria-label={`Editar ${s.nome}`} onClick={() => setDialogo({ suite: s })}>
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button variante="secondary" disabled={!s.ativo} onClick={() => aoExecutar(s)}>
            <Play className="size-4" aria-hidden />
            Executar
          </Button>
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setDialogo({ suite: null })}>
          <Plus className="size-4" aria-hidden />
          Nova suite
        </Button>
      </div>
      {lista.isPending && (
        <div aria-busy="true" aria-label="Carregando suites" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}
      {lista.isError && <AreaErro erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />}
      {lista.isSuccess && lista.data.length === 0 && (
        <EmptyState icone={<FlaskConical className="size-7" aria-hidden />} titulo="Nenhuma suite ainda" descricao="Crie a primeira suite para começar a medir o atendente." />
      )}
      {lista.isSuccess && lista.data.length > 0 && (
        <TableResponsive colunas={colunas} linhas={lista.data} chaveLinha={(s) => s.id} onRowClick={aoAbrirCasos} legenda="Suites de eval" />
      )}
      <SuiteDialog aberto={dialogo != null} aoFechar={() => setDialogo(null)} suite={dialogo?.suite ?? null} />
    </div>
  )
}
