// API publica do modulo. O registry (routes.ts) usa `custosRoutes`:
//   { prefixo: 'custos', plugin: custosRoutes },   // vira /v1/custos/*
// Produtores na api gravam via `registrarEventoCusto` (append idempotente, sem conteudo).
export { custosRoutes } from './routes'
export { registrarEventoCusto } from './service'
