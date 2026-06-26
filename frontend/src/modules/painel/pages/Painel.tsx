// Painel de controle (E9): home ÚNICA de quem tem conta (/app), POR PAPEL.
// Consolida, numa página só, o que antes eram duas telas (Painel + Lista de avisos):
// - "Precisa de você": o que aguarda ação (informado_pago como cobrador, edição a aprovar).
// - Totais POR PAPEL (a receber/recebido como cobrador; a pagar/pago como devedor),
//   calculados no BACKEND (centavos); o front só exibe (H9.2/H9.8).
// - A LISTA de combinados POR PAPEL, com faixas (Ativos/Sem aviso/Encerrados), busca e
//   filtro de situação (H9.1/H9.3). A lista vive AQUI (não no módulo avisos): este módulo
//   NUNCA importa o módulo avisos (fronteira do lint), por isso o hook useAvisos mora em ../api.
// Linguagem das Regras de Ouro: a receber/a pagar/recebido/combinado (ver linguagem.ts).
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Clock,
  Inbox,
  Plus,
  Repeat,
  Search,
  Wallet,
} from 'lucide-react'
import {
  AlternarVisaoOwner,
  Button,
  Card,
  DateInput,
  EmptyState,
  Input,
  MoneyText,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  StatCard,
  StatusBadge,
  TableResponsive,
  type ColunaTabela,
} from '@/shared/ui'
import { ROTULO_PAPEL, ROTULO_STATUS_AVISO, brl, dataPtBR } from '@/shared/format'
import {
  papelAviso,
  statusAviso,
  type Aviso,
  type PapelAviso,
  type Pendencia,
  type StatusAviso,
} from '@/shared/contracts'
import { useAvisos, usePainelPendencias, usePainelResumo } from '../api'

const ROTULO_PENDENCIA: Record<Pendencia['tipo'], string> = {
  confirmar_pagamento: 'Aguardando sua confirmação',
  aprovar_edicao: 'Edição aguardando aprovação',
}

// ---- Faixas e situações da lista (espelha o servidor, ver shared/estados.ts) ----
type Grupo = 'todos' | 'ativos' | 'agenda' | 'historico'

const FAIXAS: ReadonlyArray<{ value: Grupo; label: string }> = [
  // "Todos" junta as três faixas numa tabela só (servidor sem filtro de `grupo`).
  { value: 'todos', label: 'Todos' },
  { value: 'ativos', label: 'Ativos' },
  // H4.2: a agenda (sem_aviso) é separável dos ativos, faixa própria.
  { value: 'agenda', label: 'Sem aviso' },
  { value: 'historico', label: 'Encerrados' },
]

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

export default function PainelPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  // Período (rege os totais; na Parte B passa a reger também a lista).
  const de = params.get('de') ?? ''
  const ate = params.get('ate') ?? ''

  // Filtros da lista.
  const grupo = lerGrupo(params.get('grupo'))
  const papel = lerPapel(params.get('papel'))
  const estado = lerEstado(params.get('status'))
  const buscaUrl = params.get('busca') ?? ''

  const { data, isLoading, isError } = usePainelResumo({
    de: de || undefined,
    ate: ate || undefined,
  })
  const pendencias = usePainelPendencias()

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
  const estadoValido =
    estado !== FILTRO_TODOS && estadosFaixa.includes(estado) ? estado : FILTRO_TODOS
  const statusFiltro = estadoValido !== FILTRO_TODOS ? estadoValido : undefined

  // Com período, a lista vem desmembrada por OCORRÊNCIA (H9.6) e o mesmo período rege os
  // totais acima: um filtro só governa a página inteira.
  const emPeriodo = Boolean(de || ate)
  const lista = useAvisos({
    // "Todos" = sem filtro de faixa (o servidor devolve todos os estados).
    grupo: grupo === 'todos' ? undefined : grupo,
    papel,
    status: statusFiltro,
    busca: buscaUrl || undefined,
    ordenar: 'data_combinada',
    dir: grupo === 'historico' ? 'desc' : 'asc',
    de: de || undefined,
    ate: ate || undefined,
    per_page: 100,
  })
  const linhas = lista.data?.itens ?? []

  // Aplica um ou mais params numa ÚNICA navegação. O `setParams` do React Router entrega
  // o `prev` da render atual (não compõe chamadas sequenciais como o useState), então
  // mexer em 2 params exige um único patch, senão a 2ª chamada parte dos params antigos.
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
          {/* E6 H6.10 / H9.6: combinado recorrente. Sem período, "k de N" = pagamentos
              confirmados (progresso). Com período, a linha É uma ocorrência: mostra o
              índice dela (i de N). O front não recalcula nada; usa o que a api manda. */}
          {a.ocorrencias_total != null && a.ocorrencias_total > 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-pill bg-salvia-claro px-2 py-0.5 text-xs font-normal text-salvia"
              title={emPeriodo ? 'Ocorrência deste período' : 'Combinado recorrente'}
            >
              <Repeat strokeWidth={1.75} className="size-3" />
              {emPeriodo
                ? `${a.ocorrencia_atual ?? 1}/${a.ocorrencias_total}`
                : `${Math.min(Math.max((a.ocorrencia_atual ?? 1) - 1, 0), a.ocorrencias_total)}/${a.ocorrencias_total}`}
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

  return (
    <div className="animate-rise">
      <AlternarVisaoOwner atual="meus" />
      <PageHeader
        titulo="Painel"
        descricao="Seus combinados a receber e a pagar, num relance."
        acoes={
          <Link
            to="/app/avisos/novo"
            className="inline-flex items-center gap-2 rounded-pill bg-salvia px-5 py-2.5 text-sm font-medium text-papel transition-[background-color] duration-150 hover:bg-tinta"
          >
            <Plus strokeWidth={1.75} className="size-4" />
            Novo aviso
          </Link>
        }
      />

      {/* "Precisa de você": o que aguarda ação do usuário (H9.2). Só aparece com itens. */}
      {!pendencias.isLoading && (pendencias.data?.total ?? 0) > 0 && (
        <Card className="mb-6 border-revisao/30 bg-revisao-claro">
          <h2 className="mb-3 flex items-center gap-2 text-lg text-revisao">
            <Bell strokeWidth={1.75} className="size-5" />
            Precisa de você
          </h2>
          <ul className="flex flex-col divide-y divide-revisao/15">
            {pendencias.data!.itens.map((p) => (
              <li key={`${p.tipo}:${p.aviso_id}`}>
                <Link
                  to={`/app/avisos/${p.aviso_id}`}
                  className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-revisao"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-tinta">
                      {p.nome_outra_ponta} · {p.motivo}
                    </p>
                    <p className="text-xs text-tinta-2">
                      {ROTULO_PENDENCIA[p.tipo]} · data combinada {dataPtBR(p.data_combinada)}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium tabular-nums text-revisao">
                    {brl(p.valor_centavos)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Filtro de período (opcional, na URL). Rege os totais E a lista: com período, o
          recorrente aparece uma linha por ocorrência daquele intervalo (H9.6). */}
      <div className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-tinta-2">
            De
            <DateInput
              value={de}
              onChange={(e) => setParam({ de: e.target.value || null })}
              className="w-44"
              aria-label="Período: data inicial"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-tinta-2">
            Até
            <DateInput
              value={ate}
              onChange={(e) => setParam({ ate: e.target.value || null })}
              className="w-44"
              aria-label="Período: data final"
            />
          </label>
          {emPeriodo && (
            <Button variante="ghost" onClick={() => setParam({ de: null, ate: null })}>
              Limpar período
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-tinta-2">
          {emPeriodo
            ? 'Filtra os totais e a lista. Combinados recorrentes aparecem por ocorrência.'
            : 'Sem período, vê tudo: totais gerais e um combinado por linha.'}
        </p>
      </div>

      {/* Totais por papel (H9.2). A receber/recebido (cobrador); a pagar/pago (devedor). */}
      {isError ? (
        <EmptyState
          titulo="Não foi possível carregar os totais"
          descricao="Verifique sua conexão e tente novamente."
        />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            rotulo="A receber"
            centavos={data.a_receber_centavos}
            tom="ambar"
            icone={<Clock strokeWidth={1.75} className="size-4" />}
            detalhe={`${data.a_receber_qtd} ${data.a_receber_qtd === 1 ? 'combinado' : 'combinados'}`}
          />
          <StatCard
            rotulo="Recebido"
            centavos={data.recebido_centavos}
            tom="folha"
            icone={<ArrowDownLeft strokeWidth={1.75} className="size-4" />}
            detalhe={`${data.recebido_qtd} ${data.recebido_qtd === 1 ? 'combinado' : 'combinados'}`}
          />
          <StatCard
            rotulo="A pagar"
            centavos={data.a_pagar_centavos}
            tom="salvia"
            icone={<Wallet strokeWidth={1.75} className="size-4" />}
            detalhe={`${data.a_pagar_qtd} ${data.a_pagar_qtd === 1 ? 'combinado' : 'combinados'}`}
          />
          <StatCard
            rotulo="Pago"
            centavos={data.pago_centavos}
            tom="neutro"
            icone={<ArrowUpRight strokeWidth={1.75} className="size-4" />}
            detalhe={`${data.pago_qtd} ${data.pago_qtd === 1 ? 'combinado' : 'combinados'}`}
          />
        </div>
      )}

      {/* ---- Combinados: a lista por papel, com faixas/busca/situação (H9.1/H9.3) ---- */}
      <section className="mt-10">
        <h2 className="text-xl text-salvia">Combinados</h2>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Papel: a receber (cobrador) x a pagar (devedor). Sem papel = todos. */}
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
          {/* Faixa: todos / ativos / sem aviso / encerrados (conjunto decidido no servidor). */}
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

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

        {lista.isLoading ? (
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-card" />
            ))}
          </div>
        ) : lista.isError ? (
          <EmptyState
            titulo="Não foi possível carregar"
            descricao="Verifique sua conexão e tente novamente."
            className="mt-4"
          />
        ) : linhas.length === 0 ? (
          <EmptyState
            className="mt-4"
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
          <div className="mt-4 md:rounded-card md:border md:border-linha md:bg-cartao md:p-2">
            <TableResponsive<Aviso>
              legenda="Lista de combinados"
              colunas={colunas}
              linhas={linhas}
              // No período, várias linhas compartilham o id do combinado (uma por
              // ocorrência): a chave inclui o índice para não colidir.
              chaveLinha={(a) => `${a.id}:${a.ocorrencia_atual ?? 0}`}
              onRowClick={(a) => navigate(`/app/avisos/${a.id}`)}
            />
          </div>
        )}
      </section>
    </div>
  )
}
