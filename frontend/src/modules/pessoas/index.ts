import { lazy } from 'react'

export const PessoaPage = lazy(() => import('./pages/Pessoa'))
// E18 H18.4: lista central de clientes (aba Clientes da Gestão, /app/gestao/clientes).
export const ClientesPage = lazy(() => import('./pages/Clientes'))
