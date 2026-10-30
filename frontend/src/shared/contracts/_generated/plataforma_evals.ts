// GERADO POR scripts/gen_contracts a partir de backend/packages/shared/src/contracts/plataforma_evals.ts.
// NAO EDITAR A MAO: rode `npm run gen:contracts` no backend. Ver historias/00-fundacao/kernel-contratos.md.

// Contratos de borda do modulo plataforma_evals (Central de Evals: teste da LLM e do RAG do
// atendente, ferramenta do operador Whaviso). Fonte unica; o codegen reemite para o front.
// Schemas Zod estritos (SEC-081). Rotas de operador: o escopo de auth NAO vem do corpo; o unico
// `lojaAlvoId` aceito e o seletor da loja que a execucao mira (credencial LLM + base de conhecimento).
import { z } from 'zod'
import { Centavos, DataHoraIso, UuidSchema } from './primitivos'

// ---- Enums ----------------------------------------------------------------------------------

export const evalTipos = ['rag_retrieval', 'rag_faithfulness', 'nlu_intencao', 'harness_turno'] as const
export const EvalTipo = z.enum(evalTipos)
export type EvalTipo = z.infer<typeof EvalTipo>

export const evalFamilias = ['capability', 'regression'] as const
export const EvalFamilia = z.enum(evalFamilias)
export type EvalFamilia = z.infer<typeof EvalFamilia>

export const evalOrigens = ['manual', 'producao'] as const
export const EvalOrigem = z.enum(evalOrigens)
export type EvalOrigem = z.infer<typeof EvalOrigem>

export const evalStatusExecucaoValores = ['fila', 'rodando', 'concluida', 'falha', 'cancelada'] as const
export const EvalStatusExecucao = z.enum(evalStatusExecucaoValores)
export type EvalStatusExecucao = z.infer<typeof EvalStatusExecucao>

export const evalStatusResultadoValores = ['passou', 'falhou', 'erro'] as const
export const EvalStatusResultado = z.enum(evalStatusResultadoValores)
export type EvalStatusResultado = z.infer<typeof EvalStatusResultado>

const nome = z.string().trim().min(1).max(120)
const descricao = z.string().trim().max(1000)
const texto = z.string().trim().min(1).max(4000)
const Contagem = z.number().int().nonnegative()

// ---- Payloads de caso por tipo (entrada/esperado) -------------------------------------------

export const EvalEntradaNlu = z.strictObject({ texto })
export const EvalEsperadoNlu = z.strictObject({
  tipo: z.string().trim().min(1).max(60),
  itens: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  foraDeEscopo: z.boolean().optional(),
})

export const EvalEntradaHarness = z.strictObject({
  texto,
  persona: z.string().trim().max(200).optional(),
  historico: z
    .array(z.strictObject({ autor: z.string().trim().min(1).max(40), texto }))
    .max(40)
    .optional(),
})
export const EvalEsperadoHarness = z.strictObject({
  desfecho: z.string().trim().max(120).optional(),
  rubrica: z.string().trim().max(2000).optional(),
  naoVaza: z.boolean().optional(),
  handoffEsperado: z.boolean().optional(),
  scopeLock: z.boolean().optional(),
})

export const EvalEntradaFaithfulness = z.strictObject({ consulta: texto })
export const EvalEsperadoFaithfulness = z.strictObject({
  rubrica: z.string().trim().max(2000).optional(),
})

// rag_retrieval le o golden set (base_avaliacao) da loja alvo, nao eval_casos; os objetos vazios
// existem so para o discriminador por tipo ficar completo.
export const EvalEntradaRetrieval = z.strictObject({})
export const EvalEsperadoRetrieval = z.strictObject({})

/** Schemas de entrada/esperado indexados pelo tipo da suite (a api valida a criacao de caso). */
export const evalPayloadPorTipo = {
  nlu_intencao: { entrada: EvalEntradaNlu, esperado: EvalEsperadoNlu },
  harness_turno: { entrada: EvalEntradaHarness, esperado: EvalEsperadoHarness },
  rag_faithfulness: { entrada: EvalEntradaFaithfulness, esperado: EvalEsperadoFaithfulness },
  rag_retrieval: { entrada: EvalEntradaRetrieval, esperado: EvalEsperadoRetrieval },
} as const

// ---- Entidades ------------------------------------------------------------------------------

export const EvalSuite = z.strictObject({
  id: UuidSchema,
  nome: z.string(),
  tipo: EvalTipo,
  familia: EvalFamilia,
  descricao: z.string().nullable(),
  ativo: z.boolean(),
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type EvalSuite = z.infer<typeof EvalSuite>

export const EvalCaso = z.strictObject({
  id: UuidSchema,
  suite_id: UuidSchema,
  nome: z.string(),
  entrada: z.record(z.string(), z.unknown()),
  esperado: z.record(z.string(), z.unknown()),
  peso: z.number(),
  ativo: z.boolean(),
  origem: EvalOrigem,
  criado_em: DataHoraIso,
})
export type EvalCaso = z.infer<typeof EvalCaso>

/** Agregado guardado em eval_execucoes.resumo. */
export const EvalResumo = z.strictObject({
  total: Contagem,
  passou: Contagem,
  falhou: Contagem,
  erro: Contagem,
  scoreMedio: z.number().nullable(),
  porMetrica: z.record(z.string(), z.number()),
  tokensIn: Contagem,
  tokensOut: Contagem,
  custoCentavos: Centavos,
  latenciaP50Ms: z.number().nullable(),
  latenciaP95Ms: z.number().nullable(),
})
export type EvalResumo = z.infer<typeof EvalResumo>

export const EvalExecucao = z.strictObject({
  id: UuidSchema,
  suite_id: UuidSchema,
  loja_alvo_id: UuidSchema,
  modelo: z.string().nullable(),
  provedor: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
  status: EvalStatusExecucao,
  baseline_execucao_id: UuidSchema.nullable(),
  resumo: EvalResumo.nullable(),
  erro: z.string().nullable(),
  disparada_por: UuidSchema.nullable(),
  criada_em: DataHoraIso,
  iniciada_em: DataHoraIso.nullable(),
  concluida_em: DataHoraIso.nullable(),
})
export type EvalExecucao = z.infer<typeof EvalExecucao>

export const EvalResultado = z.strictObject({
  id: UuidSchema,
  execucao_id: UuidSchema,
  // null em rag_retrieval (resultado por pergunta do golden set, sem eval_caso).
  caso_id: UuidSchema.nullable(),
  status: EvalStatusResultado,
  scores: z.record(z.string(), z.number()),
  saida: z.record(z.string(), z.unknown()).nullable(),
  metricas: z.record(z.string(), z.unknown()).nullable(),
  erro: z.string().nullable(),
  criado_em: DataHoraIso,
})
export type EvalResultado = z.infer<typeof EvalResultado>

// ---- Suites (REST) --------------------------------------------------------------------------

export const EvalSuiteCriar = z.strictObject({
  nome,
  tipo: EvalTipo,
  familia: EvalFamilia.optional(),
  descricao: descricao.optional(),
})
export type EvalSuiteCriar = z.infer<typeof EvalSuiteCriar>

/** `tipo` e imutavel depois de criada (os casos foram validados contra ele). */
export const EvalSuiteAtualizar = z
  .strictObject({
    nome: nome.optional(),
    familia: EvalFamilia.optional(),
    descricao: descricao.nullable().optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nenhum campo informado' })
export type EvalSuiteAtualizar = z.infer<typeof EvalSuiteAtualizar>

export const EvalSuiteLista = z.array(EvalSuite)
export type EvalSuiteLista = z.infer<typeof EvalSuiteLista>

// ---- Casos (REST) ---------------------------------------------------------------------------

/** entrada/esperado sao validados pela api contra `evalPayloadPorTipo[suite.tipo]`. */
export const EvalCasoCriar = z.strictObject({
  nome,
  entrada: z.record(z.string(), z.unknown()),
  esperado: z.record(z.string(), z.unknown()).optional(),
  peso: z.number().positive().max(100).optional(),
  origem: EvalOrigem.optional(),
})
export type EvalCasoCriar = z.infer<typeof EvalCasoCriar>

export const EvalCasoAtualizar = z
  .strictObject({
    nome: nome.optional(),
    entrada: z.record(z.string(), z.unknown()).optional(),
    esperado: z.record(z.string(), z.unknown()).optional(),
    peso: z.number().positive().max(100).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nenhum campo informado' })
export type EvalCasoAtualizar = z.infer<typeof EvalCasoAtualizar>

export const EvalCasoLista = z.array(EvalCaso)
export type EvalCasoLista = z.infer<typeof EvalCasoLista>

// ---- Execucoes (REST) -----------------------------------------------------------------------

/** `lojaAlvoId` e o seletor da loja alvo da execucao, nao o escopo de auth do operador. */
export const EvalExecucaoCriar = z.strictObject({
  suiteId: UuidSchema,
  lojaAlvoId: UuidSchema,
  modelo: z.string().trim().min(1).max(120).optional(),
  provedor: z.string().trim().min(1).max(60).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
})
export type EvalExecucaoCriar = z.infer<typeof EvalExecucaoCriar>

export const EvalExecucaoCriada = EvalExecucao
export type EvalExecucaoCriada = z.infer<typeof EvalExecucaoCriada>

export const EvalExecucaoFiltro = z.strictObject({
  suiteId: UuidSchema.optional(),
  modelo: z.string().trim().min(1).max(120).optional(),
  status: EvalStatusExecucao.optional(),
})
export type EvalExecucaoFiltro = z.infer<typeof EvalExecucaoFiltro>

export const EvalExecucaoLista = z.array(EvalExecucao)
export type EvalExecucaoLista = z.infer<typeof EvalExecucaoLista>

export const EvalExecucaoDetalhe = z.strictObject({
  execucao: EvalExecucao,
  resultados: z.array(EvalResultado),
})
export type EvalExecucaoDetalhe = z.infer<typeof EvalExecucaoDetalhe>

// ---- Comparacao e baseline ------------------------------------------------------------------

export const EvalComparar = z.strictObject({
  execucaoA: UuidSchema,
  execucaoB: UuidSchema,
})
export type EvalComparar = z.infer<typeof EvalComparar>

/** Diferenca de um caso entre A e B; `null` = o caso nao tem resultado naquela execucao. */
export const EvalDiffCaso = z.strictObject({
  caso_id: UuidSchema,
  nome: z.string(),
  statusA: EvalStatusResultado.nullable(),
  statusB: EvalStatusResultado.nullable(),
  /** Delta de score medio (B menos A); `null` se algum lado nao tem score. */
  deltaScore: z.number().nullable(),
  mudou: z.boolean(),
})
export type EvalDiffCaso = z.infer<typeof EvalDiffCaso>

/** Deltas agregados (B menos A); `null` quando algum lado nao tem o dado. */
export const EvalDeltasAgregados = z.strictObject({
  scoreMedio: z.number().nullable(),
  passou: z.number().int(),
  falhou: z.number().int(),
  erro: z.number().int(),
  porMetrica: z.record(z.string(), z.number()),
  tokensIn: z.number().int(),
  tokensOut: z.number().int(),
  custoCentavos: z.number().int(),
  latenciaP50Ms: z.number().nullable(),
  latenciaP95Ms: z.number().nullable(),
})
export type EvalDeltasAgregados = z.infer<typeof EvalDeltasAgregados>

export const EvalComparacao = z.strictObject({
  execucaoA: EvalExecucao,
  execucaoB: EvalExecucao,
  deltas: EvalDeltasAgregados,
  casos: z.array(EvalDiffCaso),
})
export type EvalComparacao = z.infer<typeof EvalComparacao>

export const EvalBaselineDefinir = z.strictObject({
  execucaoId: UuidSchema,
  baselineId: UuidSchema,
})
export type EvalBaselineDefinir = z.infer<typeof EvalBaselineDefinir>
