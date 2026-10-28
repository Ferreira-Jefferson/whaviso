// Painel de disponibilidade da loja ativa, dentro da tela de Lojas. Reune as secoes (horario de
// atendimento, janela de agendamento e excecoes/feriados) e mostra o estado "agora" (aceitando
// pedido ao vivo + modo do atendente), tudo derivado no servidor. A disponibilidade e informacao
// da LOJA (fonte unica): o atendente nao tem horario proprio. Escopo = loja ativa do shell (o
// api_client envia a loja no header; trocar de loja limpa o cache). Horas e datas sao locais
// (America/Sao_Paulo): o backend decide, a tela so edita o cadastro.
import { useState, type ReactNode } from 'react'
import { CalendarClock, Clock, CalendarPlus2 } from 'lucide-react'
import { ErrorState, Skeleton, Tabs, type TabItem } from '@/shared/ui'
import { useAgendamento, useAgora, useExcecoes, useHorarios } from './api'
import { EstadoAgora } from './EstadoAgora'
import { EditorHorarioAtendimento } from './EditorHorarioAtendimento'
import { EditorAgendamento } from './EditorAgendamento'
import { EditorExcecoes } from './EditorExcecoes'

type Aba = 'atendimento' | 'agendamento' | 'excecoes'

export function PainelDisponibilidade({ nomeLoja }: { nomeLoja?: string }) {
  const [aba, setAba] = useState<Aba>('atendimento')
  const agora = useAgora()
  const horarios = useHorarios()
  const agendamento = useAgendamento()
  const excecoes = useExcecoes()

  const itens: TabItem[] = [
    {
      id: 'atendimento',
      rotulo: 'Horário de atendimento',
      conteudo: (
        <Secao
          titulo="Horário de atendimento"
          descricao="Em que dias e faixas a loja aceita pedido ao vivo. Um dia pode ter vários períodos, e um período pode virar a meia-noite."
          icone={<Clock className="size-5" strokeWidth={1.75} aria-hidden />}
        >
          {horarios.isPending && <EsqueletoLinhas />}
          {horarios.isError && <ErrorState aoTentarDeNovo={() => void horarios.refetch()} />}
          {horarios.isSuccess && <EditorHorarioAtendimento itens={horarios.data} />}
        </Secao>
      ),
    },
    {
      id: 'agendamento',
      rotulo: 'Agendamento',
      conteudo: (
        <Secao
          titulo="Janela de agendamento"
          descricao="Quando a loja aceita pedido antecipado, além do horário de atendimento. Pode ficar desligado, numa faixa própria ou aberto 24 horas."
          icone={<CalendarPlus2 className="size-5" strokeWidth={1.75} aria-hidden />}
        >
          {agendamento.isPending && <EsqueletoLinhas />}
          {agendamento.isError && <ErrorState aoTentarDeNovo={() => void agendamento.refetch()} />}
          {agendamento.isSuccess && <EditorAgendamento agendamento={agendamento.data} />}
        </Secao>
      ),
    },
    {
      id: 'excecoes',
      rotulo: 'Exceções',
      conteudo: (
        <Secao
          titulo="Exceções e feriados"
          descricao="Datas em que a loja fecha ou muda o horário. Numa data fechada, a loja para de aceitar pedidos sozinha."
          icone={<CalendarClock className="size-5" strokeWidth={1.75} aria-hidden />}
        >
          {excecoes.isPending && <EsqueletoLinhas />}
          {excecoes.isError && <ErrorState aoTentarDeNovo={() => void excecoes.refetch()} />}
          {excecoes.isSuccess && <EditorExcecoes itens={excecoes.data} />}
        </Secao>
      ),
    },
  ]

  return (
    <section aria-labelledby="disponibilidade-titulo">
      <div className="flex flex-col gap-1">
        <h2 id="disponibilidade-titulo" className="font-display text-xl font-semibold text-tinta">
          Disponibilidade
        </h2>
        <p className="text-sm text-tinta-2">
          Quando {nomeLoja ? <strong className="font-medium text-tinta">{nomeLoja}</strong> : 'a loja ativa'} atende e
          aceita pedidos. Tudo no horário de Brasília.
        </p>
      </div>

      <div className="mt-4">
        <EstadoAgora dados={agora.data} carregando={agora.isPending} />
      </div>

      <Tabs
        itens={itens}
        ativa={aba}
        aoMudar={(id) => setAba(id as Aba)}
        ariaLabel="Seções da disponibilidade"
        className="mt-5"
      />
    </section>
  )
}

function Secao({
  titulo,
  descricao,
  icone,
  children,
}: {
  titulo: string
  descricao: string
  icone: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 flex-none items-center justify-center rounded-full bg-salvia-claro text-salvia">
          {icone}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold text-tinta">{titulo}</h3>
          <p className="mt-0.5 text-sm text-tinta-2">{descricao}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function EsqueletoLinhas() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-2 rounded-card border border-linha bg-cartao p-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  )
}
