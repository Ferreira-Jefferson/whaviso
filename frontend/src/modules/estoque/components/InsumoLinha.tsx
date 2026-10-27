// Uma linha/card de insumo na lista: saldo + unidade, estoque minimo, custo (em centavos) e
// destaque quando esta abaixo do minimo. Acoes: registrar movimento e editar. Mobile-first
// (empilha no celular, linha no desktop), alvos de toque >= 44px.
import { ArrowDownUp, Pencil } from 'lucide-react'
import { Badge, Button, MoneyText, cn } from '@/shared/ui'
import type { InsumoDto } from '@/shared/contracts/_generated/estoque_insumos'
import { saldoComUnidade } from '../estados'

interface Props {
  insumo: InsumoDto
  aoMovimentar: (insumo: InsumoDto) => void
  aoEditar: (insumo: InsumoDto) => void
}

export function InsumoLinha({ insumo, aoMovimentar, aoEditar }: Props) {
  const baixo = insumo.abaixo_minimo
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-card border bg-cartao p-4 md:flex-row md:items-center md:justify-between',
        baixo ? 'border-ambar/40' : 'border-linha',
        !insumo.ativo && 'opacity-60',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-medium text-tinta">{insumo.nome}</h3>
          {baixo && <Badge tom="atencao">Estoque baixo</Badge>}
          {!insumo.ativo && <Badge tom="neutro">Inativo</Badge>}
        </div>
        <p className="mt-1 text-sm text-tinta-2">
          Minimo: <span className="tabular">{saldoComUnidade(insumo.quantidade_minima, insumo.unidade)}</span>
          {insumo.custo_unitario_centavos !== null && (
            <>
              {' · Custo: '}
              <MoneyText centavos={insumo.custo_unitario_centavos} />
              {` / ${insumo.unidade}`}
            </>
          )}
        </p>
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        <div className="text-right">
          <p className={cn('tabular text-lg leading-tight', baixo ? 'text-ambar' : 'text-tinta')}>
            {saldoComUnidade(insumo.quantidade_atual, insumo.unidade)}
          </p>
          <p className="text-xs text-tinta-2">em estoque</p>
        </div>
        <div className="flex gap-2">
          <Button variante="secondary" onClick={() => aoMovimentar(insumo)} aria-label={`Movimentar ${insumo.nome}`}>
            <ArrowDownUp strokeWidth={1.75} className="size-4" aria-hidden />
            <span className="max-md:sr-only">Movimentar</span>
          </Button>
          <Button variante="ghost" onClick={() => aoEditar(insumo)} aria-label={`Editar ${insumo.nome}`}>
            <Pencil strokeWidth={1.75} className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}
