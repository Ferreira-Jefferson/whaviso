// Fronteiras de provedor externo: interfaces, contratos Zod, erros e fakes.
// Implementacoes reais vivem nos apps (zap, atendente, api); aqui so o contrato.
export * from './erros'
export * from './whats'
export * from './llm'
export * from './mapas'
export * from './fetch_seguro'
export * from './fakes/whats'
export * from './fakes/llm'
export * from './fakes/mapas'
