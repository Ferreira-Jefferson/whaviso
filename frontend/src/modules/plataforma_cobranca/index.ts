// Cobranca da plataforma. Default = console do OPERADOR (faturas, assinaturas, rotinas):
// pagina: lazy(() => import('@/modules/plataforma_cobranca')).
// `MinhaFaturaPage` = visao do DONO DA LOJA (escopo de loja), para encaixar no shell da loja.
import { lazy } from 'react'

export { default } from './pages/Cobranca'
export const MinhaFaturaPage = lazy(() => import('./pages/MinhaFatura'))
