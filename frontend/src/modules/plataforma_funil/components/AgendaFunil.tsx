// Agenda de follow-ups: atrasados primeiro (sempre entram), depois os proximos N dias agrupados por
// dia (America/Sao_Paulo). Por padrao so os do operador logado; "Equipe toda" mostra todos.
import { useMemo, useState } from 'react'
import { CalendarCheck } from 'lucide-react'
import { Badge, Button, EmptyState, SegmentedControl, Skeleton } from '@/shared/ui'
import { diaSaoPaulo, formatarData, formatarHora } from '@/shared/format'
import type { AgendaFollowUpDto } from '@/shared/contracts/_generated/plataforma_funil'
import { useAgenda } from '../api'
import { ROTULO_ESTAGIO, TOM_ESTAGIO } from '../rotulos'
import { AreaErro } from './AreaErro'
import { ConcluirFollowUpDialog, type AlvoConclusao } from './ConcluirFollowUpDialog'

const JANELAS = [
  { value: '7', label: '7 dias' },
  { value: '14', label: '14 dias' },
  { value: '30', label: '30 dias' },
] as const

const ESCOPOS = [
  { value: 'meus', label: 'Meus' },
  { value: 'todos', label: 'Equipe toda' },
] as const

function dia(iso: string): string {
  try {
    return diaSaoPaulo(iso)
  } catch {
    return iso
  }
}

export function AgendaFunil({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  const [dias, setDias] = useState('7')
  const [escopo, setEscopo] = useState<'meus' | 'todos'>('meus')
  const [concluindo, setConcluindo] = useState<AlvoConclusao | null>(null)
  const agenda = useAgenda(Number(dias), escopo === 'todos')

  const { atrasados, porDia } = useMemo(() => {
    const itens = agenda.data?.itens ?? []
    const grupos = new Map<string, AgendaFollowUpDto[]>()
    for (const f of itens.filter((i) => !i.atrasado)) {
      const k = dia(f.agendada_para)
      grupos.set(k, [...(grupos.get(k) ?? []), f])
    }
    return {
      atrasados: itens.filter((i) => i.atrasado),
      porDia: [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)),
    }
  }, [agenda.data])

  const linha = (f: AgendaFollowUpDto) => (
    <li key={f.atividade_id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-linha bg-cartao p-4">
      <button
        type="button"
        onClick={() => aoAbrir(f.prospecto_id)}
        className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-tinta">{f.nome_restaurante}</span>
          <Badge tom={TOM_ESTAGIO[f.estagio]}>{ROTULO_ESTAGIO[f.estagio]}</Badge>
          {f.atrasado && <Badge tom="erro">Atrasado</Badge>}
        </span>
        <span className="mt-0.5 block text-xs text-tinta-2">
          {formatarData(f.agendada_para)} às {formatarHora(f.agendada_para)}
          {f.descricao ? ` · ${f.descricao}` : ''}
        </span>
      </button>
      <Button
        variante="secondary"
        className="min-h-9 px-4 py-1.5"
        onClick={() => setConcluindo({ prospectoId: f.prospecto_id, atividadeId: f.atividade_id, nomeRestaurante: f.nome_restaurante })}
      >
        Concluir
      </Button>
    </li>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl ariaLabel="Quem mostrar" value={escopo} onChange={setEscopo} options={ESCOPOS} />
        <SegmentedControl ariaLabel="Janela da agenda" value={dias} onChange={setDias} options={JANELAS} />
      </div>

      {agenda.isPending && (
        <div aria-busy="true" aria-label="Carregando agenda" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}
      {agenda.isError && <AreaErro erro={agenda.error} aoTentarDeNovo={() => void agenda.refetch()} />}

      {agenda.isSuccess && atrasados.length === 0 && porDia.length === 0 && (
        <EmptyState
          icone={<CalendarCheck className="size-7" aria-hidden />}
          titulo="Nenhum follow-up por aqui"
          descricao="Agende follow-ups no detalhe de cada prospecto para não perder o timing."
        />
      )}

      {atrasados.length > 0 && (
        <section aria-label="Follow-ups atrasados" className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-barro">Atrasados ({atrasados.length})</h3>
          <ul className="flex flex-col gap-2">{atrasados.map(linha)}</ul>
        </section>
      )}
      {porDia.map(([d, itens]) => (
        <section key={d} aria-label={`Follow-ups de ${formatarData(itens[0]!.agendada_para)}`} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-tinta-2">{formatarData(itens[0]!.agendada_para)}</h3>
          <ul className="flex flex-col gap-2">{itens.map(linha)}</ul>
        </section>
      ))}

      <ConcluirFollowUpDialog alvo={concluindo} aoFechar={() => setConcluindo(null)} />
    </div>
  )
}
