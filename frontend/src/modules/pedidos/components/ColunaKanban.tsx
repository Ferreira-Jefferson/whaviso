import { useState } from 'react'
import type { ColunaKanban as Coluna, PedidoCard } from '@/shared/contracts/_generated/pedidos'
import { cn } from '@/shared/ui'
import { CardPedido } from './CardPedido'

const FIO: Record<string, string> = {
  novo: 'bg-salvia',
  em_preparo: 'bg-ambar',
  saiu_entrega: 'bg-revisao',
  entregue: 'bg-folha',
  problema: 'bg-barro',
}

interface Props {
  chave: Coluna
  titulo: string
  itens: readonly PedidoCard[]
  temMais: boolean
  /** No mobile so a coluna ativa aparece; no desktop todas. */
  ativaNoMobile: boolean
  agora: number
  destacados: ReadonlySet<string>
  ocupadoId: string | null
  /** Card sendo arrastado (desktop); define se esta coluna aceita o drop. */
  arrastando: PedidoCard | null
  aoSoltar: (chave: Coluna) => void
  aoAbrirMover: (card: PedidoCard) => void
  aoArrastarInicio: (card: PedidoCard) => void
  aoArrastarFim: () => void
  aoMarcarProblema: (card: PedidoCard) => void
}

export function ColunaKanban({
  chave,
  titulo,
  itens,
  temMais,
  ativaNoMobile,
  agora,
  destacados,
  ocupadoId,
  arrastando,
  aoSoltar,
  aoAbrirMover,
  aoArrastarInicio,
  aoArrastarFim,
  aoMarcarProblema,
}: Props) {
  const problema = chave === 'problema'
  const [sobre, setSobre] = useState(false)
  // So aceita o drop se o servidor permite esta transicao para o card arrastado (e nao e a mesma coluna).
  const aceita = arrastando != null && arrastando.status !== chave && arrastando.destinos.includes(chave)

  return (
    <section
      id={`coluna-${chave}`}
      aria-label={titulo}
      onDragOver={(e) => {
        if (!aceita) return
        e.preventDefault()
        if (!sobre) setSobre(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false)
      }}
      onDrop={(e) => {
        setSobre(false)
        if (!aceita) return
        e.preventDefault()
        aoSoltar(chave)
      }}
      className={cn(
        'min-w-0 flex-col md:flex md:min-h-50 md:rounded-[14px] md:border md:transition-colors',
        ativaNoMobile ? 'flex' : 'hidden',
        problema ? 'md:border-[#e8cfc5] md:bg-[#f8ece7]' : 'md:border-linha md:bg-papel-2',
        aceita && !sobre && 'md:border-salvia/50',
        sobre && 'md:border-salvia md:bg-salvia/5 md:shadow-[0_0_0_2px_var(--cor-primaria)]',
      )}
    >
      <header className="relative hidden items-center gap-2 border-b border-linha px-3.5 pb-2.5 pt-3 md:flex">
        <span aria-hidden className={cn('absolute -top-px left-3.5 h-[3px] w-9 rounded-b-[3px]', FIO[chave])} />
        <h2 className="font-sans text-[15px] font-bold">{titulo}</h2>
        <span
          className={cn(
            'ml-auto min-w-6.5 rounded-pill border px-2 text-center text-[13px] font-bold tabular-nums',
            problema && itens.length > 0 ? 'border-barro/25 bg-barro/10 text-barro' : 'border-linha bg-cartao text-tinta-2',
          )}
        >
          {itens.length}
          {temMais ? '+' : ''}
        </span>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 md:p-2.5">
        {itens.length === 0 && (
          <p className={cn('rounded-card border border-dashed border-linha px-2 py-7 text-center text-sm text-tinta-2', sobre && 'md:border-salvia md:text-salvia')}>
            {sobre ? 'Solte aqui' : 'Nenhum pedido aqui'}
          </p>
        )}
        {itens.map((c) => (
          <CardPedido
            key={c.id}
            card={c}
            agora={agora}
            destacado={destacados.has(c.id)}
            ocupado={ocupadoId === c.id}
            aoMarcarProblema={aoMarcarProblema}
            aoAbrirMover={aoAbrirMover}
            aoArrastarInicio={aoArrastarInicio}
            aoArrastarFim={aoArrastarFim}
          />
        ))}
        {temMais && <p className="px-2 py-2 text-center text-sm text-tinta-2">Mostrando os mais recentes</p>}
      </div>
    </section>
  )
}
