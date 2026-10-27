// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/index.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Barrel dos contratos de borda (fonte única; o codegen reemite para o front).
// Cada módulo API-* acrescenta aqui o arquivo do seu agregado; F1 entrega os
// transversais: enums, primitivos e o auxílio de Pix (reusado por API-pagamentos).
export * from './enums'
export * from './primitivos'
export * from './pix'
export * from './sessao'
export * from './node'
export * from './eventos'
export * from './conta'
export * from './lojas'
export * from './numeros_whatsapp'
export * from './cardapio'
export * from './clientes'
export * from './conversas'
export * from './pedidos'
