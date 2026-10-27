// Contratos de borda do modulo custos (razao de custos externos: LLM, WhatsApp, mapas, fiscal).
// Fonte unica; o codegen reemite para o front. Schemas estritos (SEC-081).
//
// SEM CONTEUDO (SEC-003): nenhum contrato aqui carrega mensagem, prompt, resposta, telefone ou
// qualquer texto livre do consumidor. So categoria, origem, valor, quantidade e ids de referencia.
// A loja efetiva vem do ESCOPO (x-loja-id), nunca do corpo/query (SEC-002). Dinheiro em centavos;
// dias (`YYYY-MM-DD`) em America/Sao_Paulo; instantes em ISO UTC.
import { z } from 'zod'
import { Centavos, Cursor, UuidSchema } from './primitivos'

const Contagem = z.number().int().nonnegative()
/** Dia de negocio America/Sao_Paulo, `YYYY-MM-DD`. */
export const DiaCusto = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)

export const categoriaCusto = z.enum(['llm', 'whatsapp', 'mapas', 'fiscal'])
export type CategoriaCusto = z.infer<typeof categoriaCusto>

export const categoriaTarifaMeta = z.enum(['marketing', 'utility', 'authentication', 'service'])

// ---- Ingestao (contrato dos PRODUTORES: zap, atendente, clientes de mapas/fiscal) -------------

/** Origem: modulo/produtor do custo (ex.: `atendente`, `zap.campanha`). Minusculas, `_` e `.`. */
export const OrigemCusto = z.string().regex(/^[a-z0-9_.]{1,60}$/)
/** Id de correlacao (pedido, envio, uso_llm...). NUNCA conteudo nem telefone. */
export const ReferenciaCusto = z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/)

/** Um evento de custo a gravar. `loja_id` nulo = custo de plataforma sem loja (ex.: OTP). */
export const EventoCustoNovo = z.strictObject({
  loja_id: UuidSchema.nullable(),
  categoria: categoriaCusto,
  origem: OrigemCusto,
  valor_centavos: Centavos,
  quantidade: z.number().int().nonnegative().max(1_000_000_000).default(1),
  referencia: ReferenciaCusto.optional(),
  /** Reenvio do mesmo (origem, chave) nao duplica o custo. */
  chave_idempotencia: ReferenciaCusto.optional(),
})
export type EventoCustoNovo = z.input<typeof EventoCustoNovo>

// ---- Periodo -----------------------------------------------------------------------------------

const DIA_MS = 86_400_000
const MAX_DIAS = 92

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS) + 1
}

/** Periodo opcional (dias SP, inclusivos). Ausente: ultimos 30 dias ate hoje. Maximo 92 dias. */
export const CustosPeriodoQuery = z
  .strictObject({ de: DiaCusto.optional(), ate: DiaCusto.optional() })
  .refine((q) => !q.de || !q.ate || diasEntre(q.de, q.ate) >= 1, { message: 'ate antes de de' })
  .refine((q) => !q.de || !q.ate || diasEntre(q.de, q.ate) <= MAX_DIAS, {
    message: `periodo maximo de ${MAX_DIAS} dias`,
  })
export type CustosPeriodoQuery = z.infer<typeof CustosPeriodoQuery>

// ---- Resumo (loja e operador) -----------------------------------------------------------------

export const CustoPorCategoria = z.strictObject({
  categoria: categoriaCusto,
  total_centavos: Contagem,
  quantidade: Contagem,
  eventos: Contagem,
})
export const CustoPorOrigem = z.strictObject({ origem: OrigemCusto, total_centavos: Contagem })
export const CustoPorDia = z.strictObject({ dia: DiaCusto, total_centavos: Contagem })

const ResumoBase = {
  /** Periodo efetivo (dias SP inclusivos). */
  de: DiaCusto,
  ate: DiaCusto,
  total_centavos: Contagem,
  por_categoria: z.array(CustoPorCategoria),
  por_origem: z.array(CustoPorOrigem),
  /** Somente dias com custo, em ordem crescente. */
  por_dia: z.array(CustoPorDia),
  /** Dia de maior custo do periodo (insumo do alerta SEC-100); null sem custo. */
  pico_dia: CustoPorDia.nullable(),
  /** total / dias do periodo (inclusive), arredondado. */
  media_dia_centavos: Contagem,
}

/** GET /custos/resumo: so a loja do escopo. */
export const CustosResumoLojaSaida = z.strictObject(ResumoBase)
export type CustosResumoLoja = z.infer<typeof CustosResumoLojaSaida>

/** GET /custos/plataforma/resumo: agregado da base inteira; sem lista por loja, sem conteudo. */
export const CustosResumoPlataformaSaida = z.strictObject({
  ...ResumoBase,
  lojas_com_custo: Contagem,
  /** Parte do total sem loja (custo de plataforma). */
  sem_loja_centavos: Contagem,
})
export type CustosResumoPlataforma = z.infer<typeof CustosResumoPlataformaSaida>

// ---- Eventos (so a loja) ------------------------------------------------------------------------

export const CustosEventosEntrada = z
  .strictObject({
    de: DiaCusto.optional(),
    ate: DiaCusto.optional(),
    categoria: categoriaCusto.optional(),
    cursor: Cursor.optional(),
    limite: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((q) => !q.de || !q.ate || diasEntre(q.de, q.ate) >= 1, { message: 'ate antes de de' })
  .refine((q) => !q.de || !q.ate || diasEntre(q.de, q.ate) <= MAX_DIAS, {
    message: `periodo maximo de ${MAX_DIAS} dias`,
  })
export type CustosEventosBusca = z.infer<typeof CustosEventosEntrada>

export const EventoCustoSaida = z.strictObject({
  id: UuidSchema,
  categoria: categoriaCusto,
  origem: OrigemCusto,
  valor_centavos: Contagem,
  quantidade: Contagem,
  referencia: ReferenciaCusto.nullable(),
  criado_em: z.string().min(1),
})
export type EventoCustoDto = z.infer<typeof EventoCustoSaida>

export const CustosEventosSaida = z.strictObject({
  itens: z.array(EventoCustoSaida),
  proximoCursor: z.string().nullable(),
})

// ---- Tarifas Meta (operador) --------------------------------------------------------------------

export const TarifasMetaEntrada = z.strictObject({
  pais: z.string().regex(/^[A-Z]{2}$/).optional(),
  categoria: categoriaTarifaMeta.optional(),
})
export type TarifasMetaBusca = z.infer<typeof TarifasMetaEntrada>

export const TarifaMetaSaida = z.strictObject({
  id: UuidSchema,
  pais: z.string().regex(/^[A-Z]{2}$/),
  categoria: categoriaTarifaMeta,
  valor_centavos: Contagem,
  vigencia_inicio: DiaCusto,
  vigencia_fim: DiaCusto.nullable(),
})
export const TarifasMetaSaida = z.strictObject({ itens: z.array(TarifaMetaSaida) })
export type TarifaMetaDto = z.infer<typeof TarifaMetaSaida>
