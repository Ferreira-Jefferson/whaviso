// Card de uma loja na lista de gestao. Mostra identidade (avatar/nome), situacao (aberta agora,
// ativa/inativa, loja ativa no shell), resumo de endereco/entrega/numeros e acoes.
// Numeros de WhatsApp aqui sao so a CONTAGEM (o cadastro vive no modulo Numeros).
import { MapPin, Pencil, Power, Smartphone } from 'lucide-react'
import { AvatarLoja } from '@/shared/tenant'
import { Badge, Button, Card, cn } from '@/shared/ui'
import type { LojaSaida as Loja } from '@/shared/contracts/_generated/lojas'

function resumoEndereco(loja: Loja): string {
  const e = loja.endereco
  if (!e) return 'Sem endereço cadastrado'
  return `${e.bairro}, ${e.cidade}-${e.uf}`
}

function resumoEntrega(loja: Loja): string {
  const a = loja.area_entrega
  if (!a) return 'Só retirada no balcão'
  if (a.modo === 'raio') return `Entrega em até ${a.raio_km} km`
  const n = a.bairros.length
  return `Entrega em ${n} ${n === 1 ? 'bairro' : 'bairros'}`
}

export function CardLoja({
  loja,
  ativaNoShell,
  podeGerir,
  ehDono,
  alterandoAtivo,
  onEditar,
  onUsar,
  onAlternarAtivo,
}: {
  loja: Loja
  ativaNoShell: boolean
  podeGerir: boolean
  ehDono: boolean
  alterandoAtivo: boolean
  onEditar: () => void
  onUsar?: () => void
  onAlternarAtivo: () => void
}) {
  return (
    <Card className={cn('flex flex-col gap-4', !loja.ativo && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <AvatarLoja loja={loja} className="size-11" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-semibold text-tinta">{loja.nome}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!loja.ativo ? (
              <Badge tom="erro">Inativa</Badge>
            ) : loja.aberta_agora === true ? (
              <Badge tom="sucesso">Aberta agora</Badge>
            ) : loja.aberta_agora === false ? (
              <Badge tom="neutro">Fechada agora</Badge>
            ) : null}
            {ativaNoShell && <Badge tom="marca">Loja ativa</Badge>}
          </div>
        </div>
      </div>

      <dl className="flex flex-col gap-1.5 text-sm text-tinta-2">
        <div className="flex items-center gap-2">
          <MapPin aria-hidden strokeWidth={1.75} className="size-4 flex-none" />
          <dd className="min-w-0 truncate">{resumoEndereco(loja)}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Smartphone aria-hidden strokeWidth={1.75} className="size-4 flex-none" />
          <dd className="min-w-0 truncate">
            {loja.numeros_whatsapp.total === 0
              ? 'Nenhum número de WhatsApp'
              : `${loja.numeros_whatsapp.conectados} de ${loja.numeros_whatsapp.total} número(s) conectado(s)`}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <Power aria-hidden strokeWidth={1.75} className="size-4 flex-none" />
          <dd className="min-w-0 truncate">{resumoEntrega(loja)}</dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap gap-2">
        {podeGerir && (
          <Button type="button" variante="secondary" onClick={onEditar}>
            <Pencil aria-hidden strokeWidth={1.75} className="size-4" />
            Editar
          </Button>
        )}
        {onUsar && (
          <Button type="button" variante="ghost" onClick={onUsar}>
            Usar esta loja
          </Button>
        )}
        {ehDono && (
          <Button
            type="button"
            variante="ghost"
            loading={alterandoAtivo}
            onClick={onAlternarAtivo}
            className={cn(loja.ativo && 'text-barro hover:bg-barro/10')}
          >
            {loja.ativo ? 'Desativar' : 'Reativar'}
          </Button>
        )}
      </div>
    </Card>
  )
}
