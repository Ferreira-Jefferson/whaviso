// Despacho: a fila de pedidos prontos/corridas e o mapa de roteirizacao numa tela so, em abas.
// A roteirizacao (mapa + sugestoes de corrida) era um modulo proprio (/roteirizacao), absorvido
// aqui: despachar e uma coisa so. O Mapa carrega sob demanda (lazy) para nao puxar o Leaflet fora
// da sua aba. Rota /despacho.
import { lazy, Suspense, useState } from 'react'
import { SegmentedControl, Skeleton } from '@/shared/ui'
import Despacho from './Despacho'

const Roteirizacao = lazy(() => import('../roteirizacao/pages/Roteirizacao'))

type Aba = 'fila' | 'mapa'

const ABAS = [
  { value: 'fila', label: 'Fila' },
  { value: 'mapa', label: 'Mapa' },
] as const

export default function DespachoHub() {
  const [aba, setAba] = useState<Aba>('fila')
  return (
    <div>
      <div className="mb-4">
        <SegmentedControl ariaLabel="Seção do despacho" value={aba} onChange={setAba} options={ABAS} />
      </div>
      {aba === 'fila' ? (
        <Despacho />
      ) : (
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Roteirizacao />
        </Suspense>
      )}
    </div>
  )
}
