// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/tool.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

import { z } from 'zod'
import { MensagemProposta } from './node'

// Contrato das TOOLS do atendente (F1). Aqui vive SO o contrato: as tools concretas e o
// registry moram em `apps/atendente/src/modules/tools/` (AT-tools). Fronteira sagrada (ver
// docs/pivot/HARNESS-ATENDENTE.md): a tool LE e PROPOE; quem EFETIVA é o motor determinístico.
// A saída do modelo é DADO, nunca comando (SEC-061).

/**
 * Contexto SELADO pelo servidor a partir da conversa (que veio do `phone_number_id` do inbound).
 * É o ÚNICO lugar de onde a tool tira `loja_id`/`cliente_id` (SEC-063): o modelo nunca os vê e
 * nenhum schema de argumento de tool os declara. Imutável por construção.
 */
export interface ConversaCtx {
  readonly loja_id: string
  readonly cliente_id: string
  readonly conversa_id: string
}

/**
 * Efeito DECLARADO da tool. Nunca "efetivar": isso é do motor.
 * - leitura: só consulta dados da loja/cliente do ctx.
 * - proposta: devolve um EventoProposto (rascunho/cadastro) para o motor validar e efetivar.
 * - sinal: devolve um EventoProposto de sinalização (ex.: pedir atendimento humano).
 */
export const EfeitoTool = z.enum(['leitura', 'proposta', 'sinal'])
export type EfeitoTool = z.infer<typeof EfeitoTool>

/** Forma que toda tool implementa. Os schemas Zod validam entrada (do modelo) e saída (ao modelo). */
export interface ToolContract<TArgs = unknown, TResult = unknown> {
  /** Nome namespaced e estável (ex.: `cardapio_buscar`). */
  readonly name: string
  /** Instrução para o modelo (texto, não código). */
  readonly description: string
  readonly efeito: EfeitoTool
  /** Schema dos argumentos que o MODELO preenche. NUNCA declara loja_id/cliente_id (SEC-063). */
  readonly args: z.ZodType<TArgs>
  /** Schema do retorno, validado antes de ir ao modelo. */
  readonly result: z.ZodType<TResult>
  /** A autorização mora aqui dentro: toda consulta filtra por `ctx.loja_id` (e `ctx.cliente_id`). */
  executar(ctx: ConversaCtx, args: TArgs): Promise<TResult>
}

/**
 * Evento que o harness PROPOE ao motor (nunca executado na tool). `chave_idempotencia` é
 * determinística (conversa + tipo + conteúdo canônico): repetir a proposta não duplica o
 * efeito, o motor efetiva uma vez (SEC-066).
 */
export const EventoProposto = z
  .object({
    tipo: z.string().min(1).max(64),
    dados: z.record(z.string(), z.unknown()),
    chave_idempotencia: z.string().min(16).max(128),
  })
  .strict()
export type EventoProposto = z.infer<typeof EventoProposto>

/** Saída final do harness: o que dizer e o que propor. Efetivar é do motor. */
export const RespostaProposta = z
  .object({
    mensagens: z.array(MensagemProposta).default([]),
    eventos: z.array(EventoProposto).default([]),
  })
  .strict()
export type RespostaProposta = z.infer<typeof RespostaProposta>
