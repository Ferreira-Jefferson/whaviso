import { lazy } from 'react'

export const PainelPage = lazy(() => import('./pages/Painel'))
// Fase A: "Resultado" (métricas de negócio), rota /app/metricas.
export const MetricasNegocioPage = lazy(() => import('./pages/Metricas'))
