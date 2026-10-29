// Contabilidade de consumo em `uso_llm` (append-only; UPDATE rejeitado por trigger, SEC-033) e as
// consultas de apoio ao teto de gasto diario e ao alerta de pico (SEC-100).
//
// `uso_llm` nao tem PII: so loja, provedor, modelo, modulo (origem), tokens e custo estimado. A
// migration 0012 ja cobre todas as colunas usadas aqui (loja_id, provedor, modelo, origem,
// tokens_entrada, tokens_saida, custo_estimado_centavos); nao ha `tipo_uso` porque tudo o que este
// modulo contabiliza e uso da chave da loja (geracao/contextualizacao/STT/visao). A separacao
// geracao/embedding/rerank (embedding e rerank sao credencial da PLATAFORMA, fora daqui) e delta da
// futura migration 0013_rag, nao deste modulo. Datas de negocio em America/Sao_Paulo (banco em UTC).
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { ProvedorLlm } from './config'

/** Uma linha de consumo a gravar. Dinheiro em centavos inteiros. */
export interface RegistroUso {
  lojaId: string
  provedor: ProvedorLlm
  modelo: string | null
  /** Modulo que consumiu (coluna `origem`): ex. 'atendente', 'cardapio_importacao'. */
  origem: string
  tokensIn: number
  tokensOut: number
  custoCentavos: number
}

/** Grava o consumo (INSERT; a tabela e append-only). Colunas explicitas, sql parametrizado. */
export async function registrarUso(exec: Executor, r: RegistroUso): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.uso_llm
          (loja_id, provedor, modelo, origem, tokens_entrada, tokens_saida, custo_estimado_centavos)
        values (${r.lojaId}, ${r.provedor}, ${r.modelo}, ${r.origem},
                ${r.tokensIn}, ${r.tokensOut}, ${r.custoCentavos})`,
  )
}

/** Gasto da loja no dia corrente (America/Sao_Paulo), em centavos. Base do teto de gasto diario. */
export async function gastoDoDiaCentavos(exec: Executor, lojaId: string): Promise<number> {
  const linha = await consultarUm<{ total: number }>(
    exec,
    sql`select coalesce(sum(custo_estimado_centavos), 0)::int as total
          from public.uso_llm
         where loja_id = ${lojaId}
           and criado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')`,
  )
  return linha?.total ?? 0
}

/** Serie diaria de custo (centavos) dos ultimos `dias` dias (America/Sao_Paulo), ordem crescente. */
export interface DiaCusto {
  dia: string
  custo: number
}
export async function seriePorDiaCentavos(exec: Executor, lojaId: string, dias = 14): Promise<DiaCusto[]> {
  return consultar<DiaCusto>(
    exec,
    sql`select to_char((criado_em at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as dia,
               coalesce(sum(custo_estimado_centavos), 0)::int as custo
          from public.uso_llm
         where loja_id = ${lojaId}
           and criado_em >= (now() - make_interval(days => ${dias}))
         group by 1 order by 1`,
  )
}

/** Fator sobre a media dos dias anteriores que caracteriza um pico de consumo (SEC-100). */
export const FATOR_PICO = 3
export const MIN_DIAS_PICO = 4

/**
 * Pico de consumo (SEC-100): o dia mais recente acima de FATOR_PICO x a media dos anteriores. Puro,
 * para ser testavel sem banco. Serie em ordem crescente de dia.
 */
export function detectarPico(serie: readonly DiaCusto[], fator = FATOR_PICO, minDias = MIN_DIAS_PICO): boolean {
  if (serie.length < minDias) return false
  const ultimo = serie[serie.length - 1]!
  const anteriores = serie.slice(0, -1)
  const media = anteriores.reduce((s, d) => s + d.custo, 0) / anteriores.length
  return media > 0 && ultimo.custo > media * fator
}
