// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/node.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

import { z } from 'zod'

// Contrato dos nodes do grafo de conversa (F1). Aqui vive SO o contrato: os nodes
// concretos moram em `apps/atendente/src/nodes/<tipo>/` (AT-motor-min). A fronteira
// sagrada (ver docs/pivot/HARNESS-ATENDENTE.md) manda: um node ENTENDE e PROPOE
// (mensagens e efeitos); quem EFETIVA é o motor determinístico. Por isso a saída é
// dado proposto, nunca um comando executado aqui.

// Uma mensagem que o node propõe enviar (o transporte real a materializa via ClienteWhats).
export const MensagemProposta = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('texto'), texto: z.string().min(1).max(4096) }).strict(),
  z
    .object({
      tipo: z.literal('template'),
      template: z.string().min(1),
      variaveis: z.record(z.string(), z.string()).optional(),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('interativo'),
      texto: z.string().min(1).max(1024),
      botoes: z
        .array(z.object({ id: z.string().min(1), rotulo: z.string().min(1).max(20) }).strict())
        .min(1)
        .max(3),
    })
    .strict(),
])
export type MensagemProposta = z.infer<typeof MensagemProposta>

// Um efeito determinístico que o MOTOR efetiva (criar pedido, cobrar pix, ...). O node só
// o propõe; o motor valida e executa. `tipo` é a chave do efeito; `dados` o seu payload.
export const EfeitoProposto = z
  .object({ tipo: z.string().min(1), dados: z.record(z.string(), z.unknown()) })
  .strict()
export type EfeitoProposto = z.infer<typeof EfeitoProposto>

// Saída de um node: para onde ir, o que dizer, o que efetivar.
export const SaidaNode = z
  .object({
    proximo: z.string().min(1).nullable(),
    mensagens: z.array(MensagemProposta).default([]),
    efeitos: z.array(EfeitoProposto).default([]),
  })
  .strict()
export type SaidaNode = z.infer<typeof SaidaNode>

/**
 * Contexto SELADO pelo motor e injetado no node. `loja_id`/`conversa_id` vêm daqui,
 * nunca de argumento controlado pela LLM (SEC-063): a autorização mora no efeito/tool,
 * não no texto do modelo. Serviços concretos (tools, db) são tipados pelos módulos.
 */
export interface NodeContext {
  readonly loja_id: string
  readonly conversa_id: string
}

/** Forma que todo node do grafo implementa. A config é validada pelo próprio schema Zod. */
export interface NodeContract<TConfig = unknown, TEntrada = unknown> {
  readonly tipo: string
  readonly configSchema: z.ZodType<TConfig>
  /** Declara se o node chama a LLM (importa para custo e para a fronteira sagrada). */
  readonly usaLlm: boolean
  executar(entrada: TEntrada, config: TConfig, ctx: NodeContext): Promise<SaidaNode>
}

/** Registro de nodes por tipo. O motor resolve o node pelo `tipo` declarado no grafo. */
export type NodeRegistry = Map<string, NodeContract>
