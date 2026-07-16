import type { Pool } from '@whaviso/shared/db'
import type { BuscarItemResposta } from '@whaviso/shared/contracts'
import * as repo from './repo'

/** Autocomplete do nome do item: descrições já usadas pelo criador que batem com o prefixo. */
export async function buscarPorNome(
  pool: Pool,
  uid: string,
  prefixo: string,
): Promise<BuscarItemResposta> {
  const itens = await repo.buscarDescricaoPorPrefixo(pool, uid, prefixo)
  return { itens }
}
