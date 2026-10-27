// Consultas read-only de auditoria do admin (owner). Suspensão de conta.
import type { Pool } from '@whaviso/shared/db'
import type { AdminUsuario, AdminUsuariosQuery } from '@whaviso/shared/contracts'

function offset(page: number, perPage: number): number {
  return (page - 1) * perPage
}

// ---- Usuários (profiles + plano via assinaturas) ----
export async function listarUsuarios(
  pool: Pool,
  q: AdminUsuariosQuery,
): Promise<{ itens: AdminUsuario[]; total: number }> {
  const cond: string[] = []
  const params: unknown[] = []
  if (q.busca) {
    params.push(`%${q.busca}%`)
    cond.push(`(p.nome ilike $${params.length} or p.telefone ilike $${params.length})`)
  }
  const where = cond.length ? `where ${cond.join(' and ')}` : ''
  const total = await pool.query<{ n: string }>(
    `select count(*) as n from public.profiles p ${where}`,
    params,
  )
  params.push(q.per_page, offset(q.page, q.per_page))
  // TODO(pivo): remover saldo/creditos_carteira (dominio antigo); depende do contrato adminUsuariosResposta em shared.
  const { rows } = await pool.query<AdminUsuario & { criado_em: Date; atualizado_em: Date }>(
    `select p.id, p.nome, p.telefone, p.role, p.suspenso, p.criado_em, p.atualizado_em,
            coalesce(c.saldo_livre, 0) as saldo_livre,
            coalesce(c.reservado, 0) as reservado,
            coalesce(c.em_hold, 0) as em_hold,
            coalesce(c.consumido, 0) as consumido,
            coalesce(c.ja_comprou, false) as ja_comprou
     from public.profiles p
     left join public.creditos_carteira c on c.profile_id = p.id
     ${where}
     order by p.criado_em desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  )
  return { itens: rows, total: Number(total.rows[0]!.n) }
}

export async function usuarioExiste(pool: Pool, id: string): Promise<boolean> {
  const { rows } = await pool.query(`select 1 from public.profiles where id = $1`, [id])
  return rows.length > 0
}

/** Suspende/reativa a conta. Não apaga dados; o bloqueio é no caminho de autenticação. */
export async function definirSuspenso(pool: Pool, id: string, suspenso: boolean): Promise<void> {
  await pool.query(`update public.profiles set suspenso = $2 where id = $1`, [id, suspenso])
}
