// Disponibilidade: quando a loja atende e aceita pedidos. Reune as tres secoes (horarios de
// funcionamento, janela do atendente e excecoes/feriados) e mostra o estado "aceitando agora"
// (derivado no servidor). Horas e datas sao locais (America/Sao_Paulo): o backend decide, a tela
// so edita o cadastro. Rota `/disponibilidade`.
import { useState, type ReactNode } from 'react'
import { CalendarClock, Clock, MessageSquareDot } from 'lucide-react'
import { ErrorState, Skeleton, Tabs, type TabItem } from '@/shared/ui'
import {
  useAgora,
  useExcecoes,
  useHorarios,
  useJanela,
} from '../api'
import { EstadoAgora } from '../components/EstadoAgora'
import { EditorHorarios } from '../components/EditorHorarios'
import { EditorJanela } from '../components/EditorJanela'
import { EditorExcecoes } from '../components/EditorExcecoes'

type Aba = 'horarios' | 'janela' | 'excecoes'

export default function Disponibilidade() {
  const [aba, setAba] = useState<Aba>('horarios')
  const agora = useAgora()
  const horarios = useHorarios()
  const janela = useJanela()
  const excecoes = useExcecoes()

  const itens: TabItem[] = [
    {
      id: 'horarios',
      rotulo: 'Horários',
      conteudo: (
        <Secao
          titulo="Horários de funcionamento"
          descricao="Em que dias e faixas a loja fica aberta. Um dia pode ter vários períodos, e um período pode virar a meia-noite."
          icone={<Clock className="size-5" strokeWidth={1.75} aria-hidden />}
        >
          {horarios.isPending && <EsqueletoLinhas />}
          {horarios.isError && <ErrorState aoTentarDeNovo={() => void horarios.refetch()} />}
          {horarios.isSuccess && <EditorHorarios itens={horarios.data} />}
        </Secao>
      ),
    },
    {
      id: 'janela',
      rotulo: 'Atendente',
      conteudo: (
        <Secao
          titulo="Janela do atendente"
          descricao="Dias e faixa de horário em que o atendente do WhatsApp pode responder. Fora dela, fica em silêncio."
          icone={<MessageSquareDot className="size-5" strokeWidth={1.75} aria-hidden />}
        >
          {janela.isPending && <EsqueletoLinhas />}
          {janela.isError && <ErrorState aoTentarDeNovo={() => void janela.refetch()} />}
          {janela.isSuccess && <EditorJanela janela={janela.data} />}
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
    <div>
      <header className="border-b border-linha pb-4">
        <h1 className="text-2xl text-salvia md:text-3xl">Disponibilidade</h1>
        <p className="mt-1 text-sm text-tinta-2">
          Quando a loja atende e aceita pedidos. Tudo no horário de Brasília.
        </p>
      </header>

      <div className="mt-4">
        <EstadoAgora dados={agora.data} carregando={agora.isPending} />
      </div>

      <Tabs itens={itens} ativa={aba} aoMudar={(id) => setAba(id as Aba)} ariaLabel="Seções da disponibilidade" className="mt-5" />
    </div>
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
    <section className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 flex-none items-center justify-center rounded-full bg-salvia-claro text-salvia">
          {icone}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-tinta">{titulo}</h2>
          <p className="mt-0.5 text-sm text-tinta-2">{descricao}</p>
        </div>
      </div>
      {children}
    </section>
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
