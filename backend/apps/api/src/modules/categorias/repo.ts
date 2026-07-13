import type { Pool, PoolClient } from '@whaviso/shared/db'
import type { Categoria } from '@whaviso/shared/contracts'

type Executor = Pool | PoolClient

const COLS = `id, nome, cor, arquivada, criado_em, atualizado_em`

/** Categorias NÃO arquivadas da conta, por nome (H16.2). Isolamento por profile_id. */
export async function listar(ex: Executor, uid: string): Promise<Categoria[]> {
  const { rows } = await ex.query<Categoria>(
    `select ${COLS} from public.categorias
      where profile_id = $1 and not arquivada
      order by nome asc`,
    [uid],
  )
  return rows
}

/** Cria uma categoria (H16.1). Pode lançar 23505 (nome duplicado ativo) -> tratado no service. */
export async function criar(
  ex: Executor,
  uid: string,
  nome: string,
  cor: string | null,
): Promise<Categoria> {
  const { rows } = await ex.query<Categoria>(
    `insert into public.categorias (profile_id, nome, cor) values ($1, $2, $3)
     returning ${COLS}`,
    [uid, nome, cor],
  )
  return rows[0]!
}

/** Categoria da conta por id (ou null se não é minha). */
export async function buscar(ex: Executor, uid: string, id: string): Promise<Categoria | null> {
  const { rows } = await ex.query<Categoria>(
    `select ${COLS} from public.categorias where id = $1 and profile_id = $2`,
    [id, uid],
  )
  return rows[0] ?? null
}

export interface CamposCategoria {
  nome?: string
  cor?: string | null
  arquivada?: boolean
}

/**
 * Atualiza campos da categoria (H16.2), só os passados (undefined = mantém; cor null =
 * limpa). Escopo por profile_id. Pode lançar 23505 (renomear para nome já usado).
 */
export async function atualizar(
  ex: Executor,
  uid: string,
  id: string,
  campos: CamposCategoria,
): Promise<Categoria | null> {
  const sets: string[] = []
  const params: unknown[] = [id, uid]
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue
    params.push(v)
    sets.push(`${k} = $${params.length}`)
  }
  if (sets.length === 0) return buscar(ex, uid, id)
  const { rows } = await ex.query<Categoria>(
    `update public.categorias set ${sets.join(', ')}
      where id = $1 and profile_id = $2
      returning ${COLS}`,
    params,
  )
  return rows[0] ?? null
}
