// Agenda de pedidos agendados (/agendamento): lista por janela (futuro / liberar agora / atrasado),
// reagendar e tornar imediato. A janela e calculada pelo servidor a partir da antecedencia escolhida.
import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Select, SegmentedControl, Skeleton, useToast } from '@/shared/ui'
import type { AgendamentoDto, JanelaAgendamentoValor } from '@/shared/contracts/_generated/agendamento'
import { useAgenda, useLimparAgendamento } from '../api'
import { LinhaAgenda } from '../components/LinhaAgenda'
import { ReagendarDialog } from '../components/ReagendarDialog'
import { OPCOES_ANTECEDENCIA, ROTULO_JANELA } from '../estados'

type FiltroJanela = JanelaAgendamentoValor | 'todas'

const OPCOES_FILTRO = [
  { value: 'todas', label: 'Todos' },
  { value: 'atrasado', label: ROTULO_JANELA.atrasado },
  { value: 'liberar', label: ROTULO_JANELA.liberar },
  { value: 'futuro', label: ROTULO_JANELA.futuro },
] as const

export default function Agendamento() {
  const [filtro, setFiltro] = useState<FiltroJanela>('todas')
  const [antecedencia, setAntecedencia] = useState<string>('60')
  const [reagendar, setReagendar] = useState<AgendamentoDto | null>(null)
  const [limpar, setLimpar] = useState<AgendamentoDto | null>(null)

  const { mostrarToast } = useToast()
  const agenda = useAgenda({ janela: filtro === 'todas' ? null : filtro, antecedenciaMin: Number(antecedencia) })
  const remover = useLimparAgendamento()
  const lista = agenda.data ?? []

  async function confirmarLimpar() {
    if (!limpar) return
    try {
      await remover.mutateAsync(limpar.pedido_id)
      mostrarToast('Pedido voltou a ser imediato.', { tom: 'sucesso' })
    } catch (e) {
      mostrarToast(e instanceof ApiError ? e.message : 'Não foi possível limpar o agendamento.', { tom: 'erro' })
    } finally {
      setLimpar(null)
    }
  }

  return (
    <div>
      <PageHeader
        titulo="Agenda"
        descricao="Pedidos marcados para outro horário. A cozinha vê com antecedência o que vem por aí."
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Em telas estreitas os segmentos rolam na horizontal em vez de quebrar linha. */}
        <div className="-mb-1 overflow-x-auto pb-1">
          <SegmentedControl
            semQuebra
            ariaLabel="Janela da agenda"
            value={filtro}
            onChange={setFiltro}
            options={OPCOES_FILTRO}
          />
        </div>
        <div className="flex flex-none items-center gap-2 text-sm text-tinta-2">
          <span className="whitespace-nowrap">Liberar com</span>
          <Select
            ariaLabel="Antecedência para liberar à cozinha"
            value={antecedencia}
            onChange={setAntecedencia}
            options={OPCOES_ANTECEDENCIA}
            className="w-28"
          />
          <span className="whitespace-nowrap">de antecedência</span>
        </div>
      </div>

      {agenda.isPending && (
        <div aria-busy="true" aria-label="Carregando agenda" className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}
      {agenda.isError && <ErrorState aoTentarDeNovo={() => void agenda.refetch()} />}
      {agenda.isSuccess && lista.length === 0 && (
        <EmptyState
          icone={<CalendarClock className="size-7" aria-hidden />}
          titulo="Nenhum pedido agendado"
          descricao={
            filtro === 'todas'
              ? 'Quando um pedido for marcado para outro horário, ele aparece aqui.'
              : 'Nenhum pedido nesta janela. Veja todos para conferir o restante da agenda.'
          }
        />
      )}
      {agenda.isSuccess && lista.length > 0 && (
        <div className="grid gap-3">
          {lista.map((p) => (
            <LinhaAgenda key={p.pedido_id} pedido={p} aoReagendar={setReagendar} aoLimpar={setLimpar} />
          ))}
          {agenda.hasNextPage && (
            <Button
              variante="secondary"
              className="mx-auto"
              loading={agenda.isFetchingNextPage}
              onClick={() => void agenda.fetchNextPage()}
            >
              Carregar mais
            </Button>
          )}
        </div>
      )}

      <ReagendarDialog pedido={reagendar} onFechar={() => setReagendar(null)} />
      <ConfirmDialog
        aberto={limpar !== null}
        titulo="Tornar o pedido imediato?"
        textoConfirmar="Tornar imediato"
        carregando={remover.isPending}
        onConfirmar={() => void confirmarLimpar()}
        onCancelar={() => setLimpar(null)}
      >
        O pedido {limpar?.codigo} sai da agenda e segue o fluxo normal, sem horário marcado.
      </ConfirmDialog>
    </div>
  )
}
