// Uma linha de item dentro da categoria: nome, preco, estado e acoes (ligar/desligar, editar).
import { Pencil } from 'lucide-react'
import { formatarCentavos } from '@/shared/format'
import { Badge, Button, cn } from '@/shared/ui'
import type { ItemResolvido } from '@/shared/contracts/_generated/cardapio'
import { Alternador } from './Alternador'

interface Props {
  item: ItemResolvido
  ocupado: boolean
  aoAlternar: (item: ItemResolvido, ligado: boolean) => void
  aoEditar: (item: ItemResolvido) => void
}

export function ItemLinha({ item, ocupado, aoAlternar, aoEditar }: Props) {
  const esgotado = item.ativo && !item.disponivel
  const apagado = !item.disponivel
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className={cn('min-w-0 flex-1', apagado && 'opacity-60')}>
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-tinta">{item.nome}</span>
          {!item.ativo && <Badge tom="neutro">Desligado</Badge>}
          {esgotado && <Badge tom="atencao">Esgotado</Badge>}
          {item.sugerivel && <Badge tom="marca">Sugerido</Badge>}
        </div>
        {item.descricao && <p className="mt-0.5 truncate text-xs text-tinta-2">{item.descricao}</p>}
      </div>
      <span className="flex-none tabular-nums text-sm font-semibold text-tinta">{formatarCentavos(item.preco_centavos)}</span>
      <Alternador
        ligado={item.ativo}
        carregando={ocupado}
        onMudar={(ligado) => aoAlternar(item, ligado)}
        rotulo={`${item.ativo ? 'Desligar' : 'Ligar'} ${item.nome}`}
      />
      <Button variante="ghost" aria-label={`Editar ${item.nome}`} onClick={() => aoEditar(item)} className="flex-none px-2.5">
        <Pencil strokeWidth={1.75} className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
