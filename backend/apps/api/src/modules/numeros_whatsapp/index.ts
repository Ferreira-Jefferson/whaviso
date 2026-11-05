// API publica do modulo (rotas da LOJA). O registry (routes.ts) usa `numerosRoutes`:
//   { prefixo: 'numeros', plugin: numerosRoutes },   // vira /v1/numeros/*
// A regra de dominio e o segredo vivem no kernel compartilhado `shared/numeros`; este modulo
// e so a camada HTTP da loja.
export { numerosRoutes, criarRotasNumeros } from './routes'
