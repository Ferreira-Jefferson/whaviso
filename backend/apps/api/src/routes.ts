// Registry de modulos: 1 linha por feature. Deletar uma feature = rm -rf + 1 linha aqui.
// Cada modulo API-* adiciona UMA linha em MODULOS:
//   { prefixo: 'pedidos', plugin: pedidosRoutes },   // vira /v1/pedidos/*
// Auth/escopo sao opt-in por rota (ver AGENTS.md): config.acesso + preHandler.
import type { FastifyPluginAsync } from 'fastify'

export interface ModuloRota {
  /** Segmento unico, minusculo (ex.: 'pedidos'); a rota final e /v1/<prefixo>/... */
  prefixo: string
  plugin: FastifyPluginAsync
}

export const MODULOS: ModuloRota[] = [
  // API-* registram aqui, 1 linha cada.
]

const PREFIXO_VALIDO = /^[a-z][a-z0-9_-]*$/

/** Falha no boot se houver prefixo malformado ou duplicado. */
export function validarRegistry(modulos: readonly ModuloRota[]): void {
  const vistos = new Set<string>()
  for (const m of modulos) {
    if (!PREFIXO_VALIDO.test(m.prefixo)) throw new Error(`prefixo de modulo invalido: "${m.prefixo}"`)
    if (vistos.has(m.prefixo)) throw new Error(`prefixo de modulo duplicado: "${m.prefixo}"`)
    vistos.add(m.prefixo)
  }
}

/** Plugin que monta o registry sob /v1. `modulos` injetavel para testes. */
export function registrarModulos(modulos: readonly ModuloRota[] = MODULOS): FastifyPluginAsync {
  validarRegistry(modulos)
  return async (app) => {
    for (const m of modulos) {
      await app.register(m.plugin, { prefix: `/${m.prefixo}` })
    }
  }
}
