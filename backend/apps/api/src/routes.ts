// Registry de modulos: 1 linha por feature. Deletar uma feature = rm -rf + 1 linha aqui.
// Cada modulo API-* adiciona UMA linha em MODULOS:
//   { prefixo: 'pedidos', plugin: pedidosRoutes },   // vira /v1/pedidos/*
// Auth/escopo sao opt-in por rota (ver AGENTS.md): config.acesso + preHandler.
import type { FastifyPluginAsync } from 'fastify'
import { contaRoutes } from './modules/conta'
import { lojasRoutes } from './modules/lojas'
import { numerosRoutes } from './modules/numeros_whatsapp'
import { cardapioRoutes } from './modules/cardapio'
import { clientesRoutes } from './modules/clientes'
import { conversasRoutes } from './modules/conversas'
import { pedidosRoutes } from './modules/pedidos'
import { estoqueItensRoutes } from './modules/estoque_itens'
import { disponibilidadeRoutes } from './modules/disponibilidade'
import { pessoasRoutes } from './modules/pessoas'
import { estoqueInsumosRoutes } from './modules/estoque_insumos'
import { fichaTecnicaRoutes } from './modules/ficha_tecnica'
import { caixaRoutes } from './modules/caixa'
import { salaoRoutes } from './modules/salao'

export interface ModuloRota {
  /** Segmento unico, minusculo (ex.: 'pedidos'); a rota final e /v1/<prefixo>/... */
  prefixo: string
  plugin: FastifyPluginAsync
}

export const MODULOS: ModuloRota[] = [
  // Onda 1 (nucleo do pedido). API-* registram aqui, 1 linha cada.
  { prefixo: 'conta', plugin: contaRoutes },
  { prefixo: 'lojas', plugin: lojasRoutes },
  { prefixo: 'numeros', plugin: numerosRoutes },
  { prefixo: 'cardapio', plugin: cardapioRoutes },
  { prefixo: 'clientes', plugin: clientesRoutes },
  { prefixo: 'conversas', plugin: conversasRoutes },
  { prefixo: 'pedidos', plugin: pedidosRoutes },
  // Onda 2 (gestao do restaurante). Um prefixo por modulo.
  { prefixo: 'estoque-itens', plugin: estoqueItensRoutes },
  { prefixo: 'disponibilidade', plugin: disponibilidadeRoutes },
  { prefixo: 'pessoas', plugin: pessoasRoutes },
  { prefixo: 'estoque-insumos', plugin: estoqueInsumosRoutes },
  { prefixo: 'ficha-tecnica', plugin: fichaTecnicaRoutes },
  { prefixo: 'caixa', plugin: caixaRoutes },
  { prefixo: 'salao', plugin: salaoRoutes },
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
