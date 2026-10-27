// Helpers de consulta escopada por loja (F3, etapa 8). Os modulos usam o fragmento para
// filtrar SEMPRE pelo conjunto resolvido pelo kernel, nunca por um loja_id vindo do
// cliente (SEC-001/002). Parametrizado: o fragmento devolve o indice do placeholder.
import type { EscopoLoja, PapelMembro } from '@whaviso/shared/contracts'
import type { Permissao } from './papeis'
import { papelPermite } from './papeis'

/**
 * Fragmento `loja_id = ANY($n)` + os valores, para compor um WHERE parametrizado.
 * `posicao` e o indice 1-based do placeholder na lista final de parametros.
 *
 *   const f = fragmentoLojaIds(escopo, 1)
 *   pool.query(`select * from pedidos where ${f.sql}`, f.valores)
 */
export function fragmentoLojaIds(
  escopo: EscopoLoja,
  posicao: number,
): { sql: string; valores: [string[]] } {
  return { sql: `loja_id = any($${posicao})`, valores: [escopo.loja_ids] }
}

/** Papel do usuario na loja ativa; null se nenhuma loja ativa foi fixada. */
export function papelNaLojaAtiva(escopo: EscopoLoja): PapelMembro | null {
  if (!escopo.loja_ativa) return null
  return escopo.papel_por_loja[escopo.loja_ativa] ?? null
}

/** true se o usuario tem a permissao na loja ATIVA da requisicao. */
export function escopoPermite(escopo: EscopoLoja, permissao: Permissao): boolean {
  const papel = papelNaLojaAtiva(escopo)
  return papel ? papelPermite(papel, permissao) : false
}

/** true se o papel na loja ativa esta entre os exigidos. */
export function escopoTemPapel(escopo: EscopoLoja, papeis: readonly PapelMembro[]): boolean {
  const papel = papelNaLojaAtiva(escopo)
  return papel !== null && papeis.includes(papel)
}
