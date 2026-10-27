// Barrel dos contratos de borda (fonte única; o codegen reemite para o front).
// Cada módulo API-* acrescenta aqui o arquivo do seu agregado; F1 entrega os
// transversais: enums, primitivos e o auxílio de Pix (reusado por API-pagamentos).
export * from './enums'
export * from './primitivos'
export * from './pix'
export * from './sessao'
export * from './node'
export * from './eventos'
