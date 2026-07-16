import { lazy } from 'react'

// E17: catálogo de produtos (aba Produtos da Gestão, /app/gestao/produtos).
export const ProdutosPage = lazy(() => import('./pages/Produtos'))
