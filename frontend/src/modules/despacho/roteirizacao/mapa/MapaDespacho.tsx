// Mapa de despacho (camada pública do módulo). Carrega o leaflet sob demanda (lazy) para não pesar
// no bundle principal: só quando há sugestão para mostrar. Monta os trajetos a partir das corridas
// e da origem da loja e cuida da degradação: pedido sem coordenada nunca some, aparece na legenda e
// nos cartões ao lado (lista equivalente ao mapa, exigência de acessibilidade). A legenda abaixo do
// mapa é também o seletor por teclado das corridas (destacar sem depender de mouse).
import { Suspense, lazy, useMemo } from 'react'
import { MapPinned } from 'lucide-react'
import { Banner, Skeleton, cn } from '@/shared/ui'
import type { CorridaSugerida, DespachoConfigSaida } from '@/shared/contracts/_generated/roteirizacao'
import { pontoOrigem, trajetoDaCorrida } from './geo'

const MapaLeaflet = lazy(() => import('./MapaLeaflet'))

interface Props {
  corridas: ReadonlyArray<CorridaSugerida>
  config: DespachoConfigSaida | undefined
  ativa: number | null
  onAtiva: (ordemSaida: number | null) => void
}

export function MapaDespacho({ corridas, config, ativa, onAtiva }: Props) {
  const origem = useMemo(() => pontoOrigem(config), [config])
  const trajetos = useMemo(
    () => corridas.map((c, i) => trajetoDaCorrida(c, i, origem)),
    [corridas, origem],
  )

  const totalParadas = trajetos.reduce((n, t) => n + t.paradas.length + t.semPonto.length, 0)
  const comPonto = trajetos.reduce((n, t) => n + t.paradas.length, 0)
  const semPonto = totalParadas - comPonto

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[clamp(280px,42vh,460px)] overflow-hidden rounded-card border border-linha bg-papel-2">
        <Suspense
          fallback={
            <div className="flex size-full items-center justify-center">
              <Skeleton className="size-full" />
            </div>
          }
        >
          <MapaLeaflet origem={origem} trajetos={trajetos} ativa={ativa} onAtiva={onAtiva} />
        </Suspense>
      </div>

      {comPonto === 0 && (
        <Banner tom="info">
          {totalParadas > 0
            ? 'Os pedidos ainda não têm coordenada no mapa: eles ficam na lista das corridas ao lado. Assim que o endereço for localizado, as paradas aparecem aqui.'
            : 'Gere uma sugestão para ver as corridas no mapa.'}
          {!origem && ' A loja ainda não tem origem configurada: informe a localização na aba Configuração para centrar o mapa na saída.'}
        </Banner>
      )}
      {comPonto > 0 && semPonto > 0 && (
        <Banner tom="info">
          {semPonto === 1
            ? '1 parada ainda sem coordenada ficou fora do mapa, mas segue na corrida.'
            : `${semPonto} paradas ainda sem coordenada ficaram fora do mapa, mas seguem nas corridas.`}
        </Banner>
      )}

      {trajetos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Corridas no mapa">
          {trajetos.map((t) => {
            const destaque = ativa === t.ordemSaida
            const nParadas = t.paradas.length + t.semPonto.length
            return (
              <li key={t.ordemSaida}>
                <button
                  type="button"
                  aria-pressed={destaque}
                  onMouseEnter={() => onAtiva(t.ordemSaida)}
                  onMouseLeave={() => onAtiva(null)}
                  onFocus={() => onAtiva(t.ordemSaida)}
                  onBlur={() => onAtiva(null)}
                  onClick={() => onAtiva(destaque ? null : t.ordemSaida)}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-2 rounded-pill border px-3 text-sm font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia',
                    destaque ? 'border-tinta bg-papel-2 text-tinta' : 'border-linha text-tinta-2 hover:bg-papel-2',
                  )}
                >
                  <span className="size-3 flex-none rounded-full" style={{ backgroundColor: t.cor }} aria-hidden />
                  <MapPinned className="size-3.5 flex-none" aria-hidden />
                  Corrida {t.ordemSaida}
                  <span className="text-xs text-tinta-2">
                    {nParadas === 1 ? '1 parada' : `${nParadas} paradas`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
