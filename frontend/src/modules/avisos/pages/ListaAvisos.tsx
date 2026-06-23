// Lista de combinados (E9 H9.1/H9.3): POR PAPEL, com faixas decididas no servidor
// (Ativos / Sem aviso / Histórico), filtro por estado (rótulos canônicos), busca por
// nome OU motivo (server-side) e ordenação por data combinada. O front só EXIBE o que
// vem da API e SOLICITA filtros; nenhuma regra de negócio/cálculo de transição aqui.
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Inbox, Plus, Search } from 'lucide-react'
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

type Grupo = 'ativos' | 'agenda' | 'historico'

const FAIXAS: ReadonlyArray<{ value: Grupo; label: string }> = [
  { value: 'ativos', label: 'Ativos' },
  // H4.2: a agenda (sem_aviso) é separável dos ativos, faixa própria.
  { value: 'agenda', label: 'Sem aviso' },
  { value: 'historico', label: 'Histórico' },
]

// Estados que o usuário pode filtrar DENTRO da faixa "Ativos" (rótulos da H9.3).
const ESTADOS_ATIVOS: readonly StatusAviso[] = [
  'aguardando_aceite',
  'programado',
  'informado_pago',
  'pausado',
  'aguardando_aprovacao_aviso_editado',
  'desregistrado',
]
const FILTRO_TODOS = 'todos'
type FiltroEstado = typeof FILTRO_TODOS | StatusAviso

function lerGrupo(raw: string | null): Grupo {
  return raw === 'agenda' || raw === 'historico' ? raw : 'ativos'
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
    const t = setTimeout(() => setParam('busca', buscaInput.trim() || null), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaInput])

  // Na faixa "Ativos" o estado é um sub-filtro; nas outras faixas o servidor já fixa o
  // conjunto pelo `grupo` (H9.8: a regra de quais estados são terminais vive no servidor).
  const statusFiltro = grupo === 'ativos' && estado !== FILTRO_TODOS ? estado : undefined

  const { data, isLoading, isError } = useAvisos({
    grupo,
    papel,
    status: statusFiltro,
    busca: buscaUrl || undefined,
    // Faixas com data fazem mais sentido ordenadas por data combinada (próximas primeiro).
    ordenar: 'data_combinada',
    dir: grupo === 'historico' ? 'desc' : 'asc',
    per_page: 100,
  })

  function setParam(chave: string, valor: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (valor) next.set(chave, valor)
        else next.delete(chave)
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
        <span className="font-medium">
          {a.criador_papel === 'devedor' && papel === 'devedor'
            ? (a.nome_cobrador ?? a.nome_devedor)
            : a.nome_devedor}
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
          onChange={(v) => setParam('papel', v === 'todos' ? null : v)}
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
          onChange={(v) => {
            setParam('grupo', v === 'ativos' ? null : v)
            if (v !== 'ativos') setParam('status', null)
          }}
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
        {/* Filtro por estado: só na faixa Ativos (rótulos canônicos da H9.3). */}
        {grupo === 'ativos' && (
          <Select<FiltroEstado>
            ariaLabel="Filtrar por situação"
            value={estado}
            onChange={(v) => setParam('status', v === FILTRO_TODOS ? null : v)}
            options={[
              { value: FILTRO_TODOS, label: 'Todas as situações' },
              ...ESTADOS_ATIVOS.map((s) => ({ value: s, label: ROTULO_STATUS_AVISO[s] })),
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
            buscaUrl || grupo !== 'ativos' ? undefined : (
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
