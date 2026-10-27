// API publica do modulo. O registry (routes.ts) usa `fiscalRoutes`:
//   { prefixo: 'fiscal', plugin: fiscalRoutes },   // vira /v1/fiscal/*
export { fiscalRoutes, criarRotasFiscal } from './routes'
export type { DepsFiscal } from './service'
export { criarCifraFiscal, ErroCifra, type CifraFiscal } from './cifra'
export { emissorNaoConfigurado } from './config'
