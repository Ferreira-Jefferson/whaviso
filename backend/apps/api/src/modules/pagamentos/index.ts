// API pública do módulo. O registry (routes.ts) usa `pagamentosRoutes`:
//   { prefixo: 'pagamentos', plugin: pagamentosRoutes },   // vira /v1/pagamentos/*
export { pagamentosRoutes, criarRotasPagamentos } from './routes'
export type { DepsPagamentos } from './service'
export { criarCripto, ErroCifra, type Cripto } from './cripto'
