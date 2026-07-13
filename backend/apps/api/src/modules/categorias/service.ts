import type { Pool } from '@whaviso/shared/db'
import type { AtualizarCategoriaBody, Categoria, CriarCategoriaBody } from '@whaviso/shared/contracts'
import { conflito, naoEncontrado } from '../../shared/http_errors'
import * as repo from './repo'

/** Violação da unique (profile_id, lower(nome)) das categorias ativas (H16.1/H16.2). */
function ehNomeDuplicado(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505'
}

const DUPLICADA = 'Já existe uma categoria com esse nome.'

export function listar(pool: Pool, uid: string): Promise<Categoria[]> {
  return repo.listar(pool, uid)
}

export async function criar(pool: Pool, uid: string, body: CriarCategoriaBody): Promise<Categoria> {
  try {
    return await repo.criar(pool, uid, body.nome, body.cor ?? null)
  } catch (e) {
    if (ehNomeDuplicado(e)) throw conflito('categoria_duplicada', DUPLICADA)
    throw e
  }
}

export async function atualizar(
  pool: Pool,
  uid: string,
  id: string,
  body: AtualizarCategoriaBody,
): Promise<Categoria> {
  const atual = await repo.buscar(pool, uid, id)
  if (!atual) throw naoEncontrado('Categoria não encontrada')
  try {
    const atualizada = await repo.atualizar(pool, uid, id, {
      nome: body.nome,
      cor: body.cor,
      arquivada: body.arquivada,
    })
    return atualizada ?? atual
  } catch (e) {
    if (ehNomeDuplicado(e)) throw conflito('categoria_duplicada', DUPLICADA)
    throw e
  }
}
