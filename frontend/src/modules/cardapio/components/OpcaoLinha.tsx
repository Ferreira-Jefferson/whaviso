// Uma linha de opcao dentro do grupo: nome, acrescimo de preco, estado e acoes.
import { Pencil } from 'lucide-react'
import { formatarCentavos } from '@/shared/format'
import { Badge, Button, cn } from '@/shared/ui'
import type { OpcaoSaida } from '@/shared/contracts/_generated/cardapio'
import { Alternador } from './Alternador'

interface Props {
  opcao: OpcaoSaida
  ocupado: boolean
  aoAlternar: (opcao: OpcaoSaida, ligado: boolean) => void
  aoEditar: (opcao: OpcaoSaida) => void
}

export function OpcaoLinha({ opcao, ocupado, aoAlternar, aoEditar }: Props) {
  const esgotado = opcao.ativo && !opcao.disponivel
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <div className={cn('flex min-w-0 flex-1 items-center gap-2', !opcao.disponivel && 'opacity-60')}>
        <span className="truncate text-sm text-tinta">{opcao.nome}</span>
        {opcao.padrao && <Badge tom="marca">Padrão</Badge>}
        {!opcao.ativo && <Badge tom="neutro">Desligada</Badge>}
        {esgotado && <Badge tom="atencao">Esgotada</Badge>}
      </div>
      {opcao.preco_centavos > 0 && (
        <span className="flex-none tabular-nums text-sm text-tinta-2">+ {formatarCentavos(opcao.preco_centavos)}</span>
      )}
      <Alternador
        ligado={opcao.ativo}
        carregando={ocupado}
        onMudar={(ligado) => aoAlternar(opcao, ligado)}
        rotulo={`${opcao.ativo ? 'Desligar' : 'Ligar'} ${opcao.nome}`}
      />
      <Button variante="ghost" aria-label={`Editar ${opcao.nome}`} onClick={() => aoEditar(opcao)} className="flex-none px-2.5">
        <Pencil strokeWidth={1.75} className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
