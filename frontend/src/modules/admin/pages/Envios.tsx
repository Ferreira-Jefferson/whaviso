// /admin/envios: auditoria de envios (debug do ciclo).
// Filtros (período/status/etapa) na URL + linha expansível com detalhe técnico
// (wamid, entrega_status, erro, tentativas). O backend ATUAL não expõe este
// endpoint: degradação graciosa (estado "indisponível", não erro). Linguagem
// das Regras de Ouro em toda string da UI.
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  Banner,
  Button,
  Card,
  DateInput,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@/shared/ui'
import {
  ROTULO_ETAPA,
  ROTULO_STATUS_ENVIO,
  dataHoraPtBR,
} from '@/shared/format'
import {
  etapaEnvio,
  statusEnvio,
  type StatusEnvio,
  type EtapaEnvio,
} from '@/shared/contracts'
import { useAdminEnvios, type EnvioAuditoria } from '../api'
import { Indisponivel } from '../components/Indisponivel'

export default function EnviosPage() {
  const [params, setParams] = useSearchParams()
  const de = params.get('de') ?? ''
  const ate = params.get('ate') ?? ''
  const status = params.get('status') ?? ''
  const etapa = params.get('etapa') ?? ''

  const { data, isLoading, isError } = useAdminEnvios({
    de: de || undefined,
    ate: ate || undefined,
    status: status || undefined,
    etapa: etapa || undefined,
  })

  function setParam(chave: string, valor: string) {
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

  const temFiltro = Boolean(de || ate || status || etapa)

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Auditoria de envios"
        descricao="Acompanhe o ciclo de lembretes para diagnóstico: entrega, tentativas e mensagens técnicas."
      />

      <Card className="mb-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-tinta-2">
            De
            <DateInput value={de} onChange={(e) => setParam('de', e.target.value)} aria-label="Período inicial" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-tinta-2">
            Até
            <DateInput value={ate} onChange={(e) => setParam('ate', e.target.value)} aria-label="Período final" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-tinta-2">
            Status
            <select
              value={status}
              onChange={(e) => setParam('status', e.target.value)}
              className="rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
            >
              <option value="">Todos</option>
              {statusEnvio.options.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS_ENVIO[s as StatusEnvio]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-tinta-2">
            Etapa
            <select
              value={etapa}
              onChange={(e) => setParam('etapa', e.target.value)}
              className="rounded-input border border-linha bg-cartao px-3 py-2.5 text-sm text-tinta focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-salvia"
            >
              <option value="">Todas</option>
              {etapaEnvio.options.map((e) => (
                <option key={e} value={e}>
                  {ROTULO_ETAPA[e as EtapaEnvio]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {temFiltro && (
          <Button
            variante="ghost"
            className="self-start"
            onClick={() => {
              setParam('de', '')
              setParam('ate', '')
              setParam('status', '')
              setParam('etapa', '')
            }}
          >
            Limpar filtros
          </Button>
        )}
      </Card>

      {isError ? (
        <EmptyState
          titulo="Não foi possível carregar a auditoria"
          descricao="Verifique sua conexão e tente novamente."
        />
      ) : isLoading || !data ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      ) : data.indisponivel ? (
        <Indisponivel descricao="A api ainda não oferece o endpoint de auditoria de envios (GET /v1/admin/envios). Assim que ele existir, esta lista mostra o ciclo completo com filtros." />
      ) : data.dados!.itens.length === 0 ? (
        <EmptyState
          titulo="Nenhum lembrete neste recorte"
          descricao="Ajuste os filtros para ver outros períodos, status ou etapas."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {data.dados!.itens.map((envio) => (
            <LinhaEnvio key={envio.id} envio={envio} />
          ))}
        </div>
      )}
    </div>
  )
}

function LinhaEnvio({ envio }: { envio: EnvioAuditoria }) {
  const [aberto, setAberto] = useState(false)
  const Icone = aberto ? ChevronDown : ChevronRight

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-papel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
      >
        <Icone strokeWidth={1.75} className="size-4 shrink-0 text-tinta-2" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-tinta">
            {envio.nome_devedor ?? 'Destinatário'} · {ROTULO_ETAPA[envio.etapa]}
          </p>
          <p className="text-xs text-tinta-2">{dataHoraPtBR(envio.agendado_para)}</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-tinta-2">
          {ROTULO_STATUS_ENVIO[envio.status]}
        </span>
      </button>

      {aberto && (
        <dl className="grid grid-cols-1 gap-3 border-t border-linha px-4 py-4 text-sm sm:grid-cols-2">
          <Detalhe rotulo="Identificador do lembrete" valor={envio.id} mono />
          <Detalhe rotulo="Aviso" valor={envio.aviso_id} mono />
          <Detalhe rotulo="Tentativas" valor={String(envio.tentativas)} />
          <Detalhe
            rotulo="Enviado em"
            valor={envio.enviado_em ? dataHoraPtBR(envio.enviado_em) : ''}
          />
          <Detalhe
            rotulo="Próxima tentativa"
            valor={
              envio.proxima_tentativa_em ? dataHoraPtBR(envio.proxima_tentativa_em) : ''
            }
          />
          <Detalhe rotulo="Entrega (WhatsApp)" valor={envio.entrega_status ?? ''} />
          <Detalhe rotulo="wamid" valor={envio.wamid ?? ''} mono />
          {envio.erro && (
            <div className="sm:col-span-2">
              <Banner tom="erro">Mensagem técnica: {envio.erro}</Banner>
            </div>
          )}
        </dl>
      )}
    </Card>
  )
}

function Detalhe({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-tinta-2">{rotulo}</dt>
      <dd className={`mt-0.5 break-all text-tinta ${mono ? 'font-mono text-xs' : ''}`}>{valor}</dd>
    </div>
  )
}
