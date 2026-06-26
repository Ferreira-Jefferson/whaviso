import { lazy } from 'react'

// A lista (ListaAvisos) foi consolidada no Painel (modules/painel). Este módulo
// mantém só a criação e o detalhe do combinado.
export const NovoAvisoPage = lazy(() => import('./pages/NovoAviso'))
export const DetalheAvisoPage = lazy(() => import('./pages/DetalheAviso'))
