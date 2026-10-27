// Contratos de borda do modulo plataforma_painel (read-model de crescimento da base para o operador
// Whaviso). Fonte unica; o codegen reemite para o front. Schemas Zod estritos (SEC-081).
// So agregados: nunca conteudo nem volume de uso de loja (SEC-003). Dinheiro em centavos;
// razoes (churn, conversao) em fracao 0..1, `null` quando o denominador e zero (nunca 0 falso).
import { z } from 'zod'
import { Centavos, DataHoraIso } from './primitivos'

const Contagem = z.number().int().nonnegative()
/** Fracao 0..1; `null` = sem base para calcular. */
const Razao = z.number().min(0).max(1).nullable()
/** Mes de referencia America/Sao_Paulo, `YYYY-MM`. */
const MesRef = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

export const PainelSerieQuery = z.strictObject({
  meses: z.coerce.number().int().min(1).max(24).default(12),
})
export type PainelSerieQuery = z.infer<typeof PainelSerieQuery>

export const PainelResumo = z.strictObject({
  calculado_em: DataHoraIso,
  mes: MesRef,
  mrr_centavos: Centavos,
  arpa_centavos: Centavos.nullable(),
  lojas_ativas: Contagem,
  contas_ativas: Contagem,
  assinaturas: z.strictObject({
    trial: Contagem,
    ativa: Contagem,
    suspensa: Contagem,
    cancelada: Contagem,
  }),
  novas_contas_mes: Contagem,
  churn_contas: Razao,
  churn_mrr: Razao,
  inadimplencia: z.strictObject({
    valor_centavos: Centavos,
    contas: Contagem,
  }),
  receita_realizada_centavos: Centavos,
  conversao_funil: Razao,
  conversao_trial: Razao,
})
export type PainelResumo = z.infer<typeof PainelResumo>

export const PainelSerieMes = z.strictObject({
  mes: MesRef,
  mrr_centavos: Centavos,
  assinaturas_ativas: Contagem,
  novas_contas: Contagem,
  cancelamentos: Contagem,
  churn_contas: Razao,
  receita_realizada_centavos: Centavos,
})
export type PainelSerieMes = z.infer<typeof PainelSerieMes>

export const PainelSerie = z.strictObject({
  calculado_em: DataHoraIso,
  /** Sempre true: o MRR passado usa o valor atual da assinatura (nao ha historico de reajuste). */
  mrr_aproximado: z.boolean(),
  meses: z.array(PainelSerieMes),
})
export type PainelSerie = z.infer<typeof PainelSerie>
