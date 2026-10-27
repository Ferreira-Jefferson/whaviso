// Montagem do EscopoLoja a partir dos vinculos crus (F3). Pura (sem I/O), testavel.
//
// DECISAO (registrada no spec, Notas): o kernel modela UMA conta por escopo de usuario,
// o caso dominante do produto (um dono/equipe operam uma conta). Se um usuario resolver
// vinculos em mais de uma conta, FALHAMOS FECHADO (ErroEscopoAmbiguo): e preferivel negar
// do que adivinhar a conta efetiva e arriscar cruzar tenant. Um modulo futuro que precise
// de multi-conta refina isto; o mecanismo seguro vem primeiro.
import type { EscopoLoja } from '@whaviso/shared/contracts'
import type { PapelMembro } from '@whaviso/shared/contracts'
import type { VinculoLoja } from './leitor_escopo'
import { papelMaisForte } from './papeis'

export class ErroEscopoAmbiguo extends Error {
  constructor() {
    super('usuario com vinculos em mais de uma conta nao e suportado pelo kernel')
    this.name = 'ErroEscopoAmbiguo'
  }
}

/**
 * Constroi o escopo resolvido. `vinculos` vazio devolve null (sem acesso a loja).
 * Dedup por loja: se houver vinculo direto e vinculo "todas" para a mesma loja, fica o
 * papel mais forte. `loja_ativa` e definido depois pelo plugin (validado contra loja_ids).
 */
export function montarEscopoLoja(userId: string, vinculos: VinculoLoja[]): EscopoLoja | null {
  if (vinculos.length === 0) return null

  const contas = new Set(vinculos.map((v) => v.conta_id))
  if (contas.size > 1) throw new ErroEscopoAmbiguo()
  const conta_id = vinculos[0]!.conta_id

  const papelPorLoja = new Map<string, PapelMembro>()
  for (const v of vinculos) {
    const atual = papelPorLoja.get(v.loja_id)
    papelPorLoja.set(v.loja_id, atual ? papelMaisForte(atual, v.papel) : v.papel)
  }

  const loja_ids = [...papelPorLoja.keys()].sort()
  const papel_por_loja: Record<string, PapelMembro> = {}
  for (const loja of loja_ids) papel_por_loja[loja] = papelPorLoja.get(loja)!

  return {
    tipo: 'loja',
    user_id: userId,
    conta_id,
    loja_ids,
    papel_por_loja,
    loja_ativa: null,
  }
}
