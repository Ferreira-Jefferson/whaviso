// Lista de combinados (E9 H9.1/H9.3): POR PAPEL, com faixas decididas no servidor
// (Ativos / Sem aviso / Histórico), filtro por estado (rótulos canônicos), busca por
// nome OU motivo (server-side) e ordenação por data combinada. O front só EXIBE o que
// vem da API e SOLICITA filtros; nenhuma regra de negócio/cálculo de transição aqui.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Inbox, Plus, Repeat, Search } from 'lucide-react'
import {
  Button,
  EmptyState,
  Input,
  MoneyText,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  StatusBadge,
  TableResponsive,
  type ColunaTabela,
} from '@/shared/ui'
import { ROTULO_PAPEL, ROTULO_STATUS_AVISO, dataPtBR } from '@/shared/format'
import {
  papelAviso,
  statusAviso,
  type Aviso,
  type PapelAviso,
  type StatusAviso,
} from '@/shared/contracts'
import { useAvisos } from '../api'

type Grupo = 'todos' | 'ativos' | 'agenda' | 'historico'

const FAIXAS: ReadonlyArray<{ value: Grupo; label: string }> = [
  // "Todos" junta as três faixas numa tabela só (servidor sem filtro de `grupo`).
  { value: 'todos', label: 'Todos' },
  { value: 'ativos', label: 'Ativos' },
  // H4.2: a agenda (sem_aviso) é separável dos ativos, faixa própria.
  { value: 'agenda', label: 'Sem aviso' },
  { value: 'historico', label: 'Encerrados' },
]

// Estados filtráveis DENTRO de cada faixa (espelha o servidor, ver shared/estados.ts).
// Só aparecem como sub-filtro os estados daquela faixa; a faixa "Sem aviso" tem um
// estado só (sem_aviso), então não mostra filtro (nada a filtrar).
const ESTADOS_ATIVOS: readonly StatusAviso[] = [
  'aguardando_aceite',
  'programado',
  'informado_pago',
  'pausado',
  'aguardando_aprovacao_aviso_editado',
  'desregistrado',
]
const ESTADOS_HISTORICO: readonly StatusAviso[] = ['pago', 'cancelado', 'recusado', 'expirado']
const ESTADOS_AGENDA: readonly StatusAviso[] = ['sem_aviso']
const ESTADOS_TODOS: readonly StatusAviso[] = [
  ...ESTADOS_ATIVOS,
  ...ESTADOS_AGENDA,
  ...ESTADOS_HISTORICO,
]
const ESTADOS_POR_FAIXA: Record<Grupo, readonly StatusAviso[]> = {
  todos: ESTADOS_TODOS,
  ativos: ESTADOS_ATIVOS,
  agenda: ESTADOS_AGENDA,
  historico: ESTADOS_HISTORICO,
}

const FILTRO_TODOS = 'todos'
type FiltroEstado = typeof FILTRO_TODOS | StatusAviso

function lerGrupo(raw: string | null): Grupo {
  return raw === 'agenda' || raw === 'historico' || raw === 'todos' ? raw : 'ativos'
}
function lerPapel(raw: string | null): PapelAviso | undefined {
  if (!raw) return undefined
  return papelAviso.safeParse(raw).success ? (raw as PapelAviso) : undefined
}
function lerEstado(raw: string | null): FiltroEstado {
  if (!raw || raw === FILTRO_TODOS) return FILTRO_TODOS
  return statusAviso.safeParse(raw).success ? (raw as StatusAviso) : FILTRO_TODOS
}

export default function ListaAvisosPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const grupo = lerGrupo(params.get('grupo'))
  const papel = lerPapel(params.get('papel'))
  const estado = lerEstado(params.get('status'))
  const buscaUrl = params.get('busca') ?? ''

  // Busca com debounce local antes de ir ao servidor (server-side por nome OU motivo).
  const [buscaInput, setBuscaInput] = useState(buscaUrl)
  useEffect(() => {
    const t = setTimeout(() => setParam({ busca: buscaInput.trim() || null }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaInput])

  // Sub-filtro de situação por faixa: só os estados daquela faixa. O filtro só aparece
  // quando a faixa tem mais de um estado (Sem aviso tem só sem_aviso, nada a filtrar).
  const estadosFaixa = ESTADOS_POR_FAIXA[grupo]
  const mostrarFiltroEstado = estadosFaixa.length > 1
  // Guarda contra estado vindo da URL que não pertence à faixa atual (ex.: troca de aba).
  const estadoValido =
    estado !== FILTRO_TODOS && estadosFaixa.includes(estado) ? estado : FILTRO_TODOS
  const statusFiltro = estadoValido !== FILTRO_TODOS ? estadoValido : undefined

  const { data, isLoading, isError } = useAvisos({
    // "Todos" = sem filtro de faixa (o servidor devolve todos os estados).
    grupo: grupo === 'todos' ? undefined : grupo,
    papel,
    status: statusFiltro,
    busca: buscaUrl || undefined,
    // Faixas com data fazem mais sentido ordenadas por data combinada (próximas primeiro).
    ordenar: 'data_combinada',
    dir: grupo === 'historico' ? 'desc' : 'asc',
    per_page: 100,
  })

  // Aplica um ou mais params numa ÚNICA navegação. Importante: o `setParams` do React
  // Router entrega o `prev` da render atual (não compõe chamadas sequenciais como o
  // useState), então mexer em 2 params exige um único patch, senão a 2ª chamada parte
  // dos params antigos e sobrescreve a 1ª.
  function setParam(patch: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [chave, valor] of Object.entries(patch)) {
          if (valor) next.set(chave, valor)
          else next.delete(chave)
        }
        return next
      },
      { replace: true },
    )
  }

  const linhas = data?.itens ?? []

  const colunas: ReadonlyArray<ColunaTabela<Aviso>> = [
    {
      chave: 'nome',
      titulo: 'Nome',
      principal: true,
      render: (a) => (
        <span className="inline-flex items-center gap-2 font-medium">
          {a.criador_papel === 'devedor' && papel === 'devedor'
            ? (a.nome_cobrador ?? a.nome_devedor)
            : a.nome_devedor}
          {/* E6 H6.10: combinado recorrente. Progresso "k de N" direto do que a api
              manda (ocorrencia_atual/ocorrencias_total); o front não recalcula. */}
          {a.ocorrencias_total != null && a.ocorrencias_total > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-pill bg-salvia-claro px-2 py-0.5 text-xs font-normal text-salvia"
              title="Combinado recorrente"
            >
              <Repeat strokeWidth={1.75} className="size-3" />
              {Math.min(Math.max((a.ocorrencia_atual ?? 1) - 1, 0), a.ocorrencias_total)}/
              {a.ocorrencias_total}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'motivo',
      titulo: 'Sobre',
      render: (a) => <span className="text-tinta-2">{a.motivo}</span>,
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      alinhar: 'direita',
      render: (a) => <MoneyText centavos={a.valor_centavos} />,
    },
    {
      chave: 'data',
      titulo: 'Data combinada',
      render: (a) => dataPtBR(a.data_combinada),
    },
    {
      chave: 'status',
      titulo: 'Situação',
      ocultarRotuloMobile: true,
      render: (a) => <StatusBadge status={a.status} />,
    },
  ]

  const tituloFaixa = papel ? ROTULO_PAPEL[papel] : 'Combinados'

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Avisos"
        descricao={
          papel
            ? `${tituloFaixa}: o que você ${papel === 'cobrador' ? 'vai receber' : 'vai pagar'}.`
            : 'Seus combinados a receber e a pagar.'
        }
        acoes={
          <Button onClick={() => navigate('/app/avisos/novo')}>
            <Plus strokeWidth={1.75} className="size-4" />
            Novo aviso
          </Button>
        }
      />

      {/* Papel: a receber (cobrador) x a pagar (devedor). Sem papel = todos. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SegmentedControl<PapelAviso | 'todos'>
          ariaLabel="Papel nos combinados"
          value={papel ?? 'todos'}
          onChange={(v) => setParam({ papel: v === 'todos' ? null : v })}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'cobrador', label: ROTULO_PAPEL.cobrador },
            { value: 'devedor', label: ROTULO_PAPEL.devedor },
          ]}
        />
        {/* Faixa: ativos / sem aviso / histórico (conjunto decidido no servidor). */}
        <SegmentedControl<Grupo>
          ariaLabel="Faixa dos combinados"
          value={grupo}
          onChange={(v) =>
            // Troca de faixa limpa o sub-filtro de situação (só vale em "Ativos"),
            // num único patch para não perder a mudança de `grupo`.
            setParam({ grupo: v === 'ativos' ? null : v, status: null })
          }
          options={FAIXAS}
        />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:w-72">
          <Search
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-2"
          />
          <Input
            type="search"
            placeholder="Buscar por nome ou motivo"
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            className="pl-9"
            aria-label="Buscar por nome ou motivo"
          />
        </div>
        {/* Filtro por situação: só os estados da faixa atual; oculto quando a faixa tem
            um estado só (Sem aviso). Rótulos canônicos da H9.3. */}
        {mostrarFiltroEstado && (
          <Select<FiltroEstado>
            ariaLabel="Filtrar por situação"
            value={estadoValido}
            onChange={(v) => setParam({ status: v === FILTRO_TODOS ? null : v })}
            options={[
              { value: FILTRO_TODOS, label: 'Todas as situações' },
              ...estadosFaixa.map((s) => ({ value: s, label: ROTULO_STATUS_AVISO[s] })),
            ]}
            className="lg:w-56"
          />
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          titulo="Não foi possível carregar"
          descricao="Verifique sua conexão e tente novamente."
        />
      ) : linhas.length === 0 ? (
        <EmptyState
          icone={<Inbox strokeWidth={1.5} className="size-10" />}
          titulo={buscaUrl ? 'Nenhum resultado' : 'Nenhum combinado por aqui'}
          descricao={
            buscaUrl
              ? 'Nenhum combinado corresponde à sua busca.'
              : grupo === 'historico'
                ? 'Combinados encerrados aparecem aqui.'
                : grupo === 'agenda'
                  ? 'Anotações na agenda (nada enviado ainda) aparecem aqui.'
                  : 'Crie seu primeiro combinado para gerar o convite.'
          }
          acao={
            buscaUrl || (grupo !== 'ativos' && grupo !== 'todos') ? undefined : (
              <Link
                to="/app/avisos/novo"
                className="inline-flex items-center gap-2 rounded-pill bg-salvia px-5 py-2.5 text-sm font-medium text-papel hover:bg-tinta"
              >
                <Plus strokeWidth={1.75} className="size-4" />
                Novo aviso
              </Link>
            )
          }
        />
      ) : (
        <div className="md:rounded-card md:border md:border-linha md:bg-cartao md:p-2">
          <TableResponsive<Aviso>
            legenda="Lista de avisos"
            colunas={colunas}
            linhas={linhas}
            chaveLinha={(a) => a.id}
            onRowClick={(a) => navigate(`/app/avisos/${a.id}`)}
          />
        </div>
      )}
    </div>
  )
}
