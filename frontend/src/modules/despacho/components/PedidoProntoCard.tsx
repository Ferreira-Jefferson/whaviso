// Card de um pedido pronto para sair (sem motoboy e sem corrida): codigo, destino, valor do
// motoboy e duas acoes: marcar para montar uma corrida e atribuir um motoboy direto (entrega
// avulsa). Endereco so em resumo/bairro, sem telefone nem nome do cliente.
import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { formatarCentavos, formatarHora } from '@/shared/format'
import { Badge, Button, Card, Select, cn } from '@/shared/ui'
import type { MotoboyCarga, PedidoPronto } from '../api'
import { ROTULO_STATUS_PEDIDO } from '../estados'

interface Props {
  pedido: PedidoPronto
  motoboys: ReadonlyArray<MotoboyCarga>
  selecionado: boolean
  aoAlternar: () => void
  aoAtribuir: (motoboyId: string) => void
  atribuindo: boolean
}

export function PedidoProntoCard({ pedido, motoboys, selecionado, aoAlternar, aoAtribuir, atribuindo }: Props) {
  const [motoboyId, setMotoboyId] = useState('')
  const destino = [pedido.endereco.resumo, pedido.endereco.bairro].filter(Boolean).join(' · ')

  return (
    <Card className={cn('flex flex-col gap-3 p-4', selecionado && 'border-salvia ring-1 ring-salvia')}>
      <div className="flex items-start justify-between gap-3">
        <label className="flex min-w-0 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={selecionado}
            onChange={aoAlternar}
            className="mt-1 size-5 flex-none accent-salvia"
            aria-label={`Selecionar pedido ${pedido.codigo} para montar corrida`}
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-base font-medium text-tinta">
              Pedido {pedido.codigo}
              <Badge tom={pedido.status === 'em_preparo' ? 'atencao' : 'marca'}>{ROTULO_STATUS_PEDIDO[pedido.status]}</Badge>
            </span>
            <span className="flex items-start gap-1 text-sm text-tinta-2">
              <MapPin className="mt-0.5 size-3.5 flex-none" aria-hidden />
              <span className="min-w-0 break-words">{destino || 'Endereço não informado'}</span>
            </span>
          </span>
        </label>
        <span className="tabular flex-none text-sm font-medium text-tinta">{formatarCentavos(pedido.total_centavos)}</span>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-2">
        <span>Zona: {pedido.zona_nome ?? 'sem zona'}</span>
        <span className="tabular">Motoboy recebe: {formatarCentavos(pedido.valor_motoboy_centavos)}</span>
        <span>Pedido às {formatarHora(pedido.criado_em)}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="min-w-0 flex-1 basis-44"
          ariaLabel={`Motoboy para o pedido ${pedido.codigo}`}
          value={motoboyId}
          onChange={setMotoboyId}
          options={[
            { value: '', label: 'Escolher motoboy' },
            ...motoboys.map((m) => ({ value: m.id, label: m.nome })),
          ]}
        />
        <Button
          variante="secondary"
          disabled={motoboyId === ''}
          loading={atribuindo}
          onClick={() => aoAtribuir(motoboyId)}
        >
          Atribuir
        </Button>
      </div>
    </Card>
  )
}
