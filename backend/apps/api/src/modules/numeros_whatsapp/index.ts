// API publica do modulo. O registry (routes.ts) usa `numerosRoutes`:
//   { prefixo: 'numeros', plugin: numerosRoutes },   // vira /v1/numeros/*
export { numerosRoutes, criarRotasNumeros } from './routes'
export type { DepsNumeros } from './service'
export type { MetaOnboarding, TokenMeta, TelefoneMeta } from './meta_onboarding'
export { criarMetaOnboardingHttp, ErroMeta } from './meta_onboarding'
export { criarCripto, ErroCifra, type Cripto } from './cripto'
