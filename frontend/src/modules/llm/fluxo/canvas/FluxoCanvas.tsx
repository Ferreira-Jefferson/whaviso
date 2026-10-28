// Canvas do fluxo (camada pública). Carrega o React Flow sob demanda (lazy) para não pesar no bundle
// principal: entra só quando a visão "Mapa" está aberta. O container tem altura definida (o React
// Flow exige) e um fallback enquanto o chunk carrega.
import { Suspense, lazy } from 'react'
import { Skeleton } from '@/shared/ui'
import type { FluxoGrafo, FluxoProblema } from '@/shared/contracts/_generated/fluxo'
import type { ItemCatalogo } from '../api'

const Inner = lazy(() => import('./FluxoCanvasReactFlow'))

interface Props {
  grafo: FluxoGrafo
  catalogo: ItemCatalogo[]
  problemas: FluxoProblema[]
  selecionado: string | null
  onSelecionar: (id: string | null) => void
  onMover: (id: string, x: number, y: number) => void
  podeEditar: boolean
}

export function FluxoCanvas(props: Props) {
  return (
    <div className="h-[clamp(420px,60vh,680px)] overflow-hidden rounded-card border border-linha bg-papel-2">
      <Suspense fallback={<Skeleton className="size-full" />}>
        <Inner {...props} />
      </Suspense>
    </div>
  )
}
