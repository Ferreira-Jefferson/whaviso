// Contexto do ator: quem e o membro autenticado, em qual conta e com que alcance de gestao.
// A conta NUNCA vem do corpo/query/params: sempre dos vinculos ativos em `membros` do `sub` do JWT.
import type { Executor } from '@whaviso/shared/db'
import { Proibido } from '../../shared/http_errors'
import { vinculosAtivos, type Vinculo } from './repo'

export interface Alcance {
  /** true = todas as lojas da conta. */
  todas: boolean
  lojas: ReadonlySet<string>
}

export interface Ator {
  userId: string
  contaId: string
  vinculos: Vinculo[]
  ehDono: boolean
  /** dono ou gerente: pode listar/gerir membros e convites (dentro do alcance). */
  podeGerir: boolean
  alcance: Alcance
}

/** Resolve o ator a partir do user_id autenticado. 403 se sem conta ou com conta ambigua. */
export async function resolverAtor(exec: Executor, userId: string): Promise<Ator> {
  const vinculos = await vinculosAtivos(exec, userId)
  if (vinculos.length === 0) throw new Proibido('Sem conta', 'sem_conta')
  const contas = new Set(vinculos.map((v) => v.conta_id))
  if (contas.size > 1) throw new Proibido('Escopo de conta ambiguo', 'conta_ambigua')

  const ehDono = vinculos.some((v) => v.papel === 'dono')
  const gestores = vinculos.filter((v) => v.papel === 'dono' || v.papel === 'gerente')
  const todas = ehDono || gestores.some((v) => v.loja_id === null)
  const lojas = new Set(gestores.flatMap((v) => (v.loja_id ? [v.loja_id] : [])))
  return {
    userId,
    contaId: vinculos[0]!.conta_id,
    vinculos,
    ehDono,
    podeGerir: gestores.length > 0,
    alcance: { todas, lojas },
  }
}

export function exigirGestor(ator: Ator): void {
  if (!ator.podeGerir) throw new Proibido()
}

export function exigirDono(ator: Ator): void {
  if (!ator.ehDono) throw new Proibido()
}

/** loja_id (null = todas) dentro do alcance do ator. */
export function alcanca(ator: Ator, lojaId: string | null): boolean {
  if (ator.alcance.todas) return true
  return lojaId !== null && ator.alcance.lojas.has(lojaId)
}
