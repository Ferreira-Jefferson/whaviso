// API publica do modulo. O registry (routes.ts) usa `configuracoesLlmRoutes`:
//   { prefixo: 'llm', plugin: configuracoesLlmRoutes },   // vira /v1/llm/*
export { configuracoesLlmRoutes, criarRotasConfigLlm } from './routes'
export type { DepsConfigLlm } from './service'
export { criarCifraLlm, ErroCifra, type CifraLlm } from './cifra'
export {
  criarValidadoresProducao,
  type RegistroValidadores,
  type ValidadorProvedor,
} from './provedores'
