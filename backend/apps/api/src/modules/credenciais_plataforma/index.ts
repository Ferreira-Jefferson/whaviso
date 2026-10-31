// API publica do modulo. O registry (routes.ts) usa `credenciaisPlataformaRoutes`:
//   { prefixo: 'credenciais-plataforma', plugin: credenciaisPlataformaRoutes },  // /v1/credenciais-plataforma/*
export { credenciaisPlataformaRoutes, criarRotasCredenciaisPlataforma } from './routes'
export type { DepsCredenciaisPlataforma } from './service'
export { criarCifraCredenciaisPlataforma, ErroCifra, type CifraCredenciaisPlataforma } from './cripto'
