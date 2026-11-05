// API publica do modulo (rotas do CONSOLE de numeros). O registry (routes.ts) usa
// `plataformaNumerosRoutes`:
//   { prefixo: 'plataforma-numeros', plugin: plataformaNumerosRoutes },  // vira /v1/plataforma-numeros/*
export { plataformaNumerosRoutes, criarRotasPlataformaNumeros } from './routes'
