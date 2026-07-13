import type { Pool } from '@whaviso/shared/db'
import type {
  BuscarPessoaResposta,
  GrupoPessoa,
  PessoaCombinadosResposta,
  PessoaResumoResposta,
} from '@whaviso/shared/contracts'
import { naoEncontrado } from '../../shared/http_errors'
import * as repo from './repo'

const PESSOA_INEXISTENTE =
  'Combinado não encontrado, ou ainda sem WhatsApp da outra ponta para agrupar.'

/**
 * Resumo da pessoa (H15.1/H15.2): resolve o telefone da outra ponta a partir de um
 * combinado do usuário (no servidor, telefone nunca em rota) e devolve os quatro totais.
 */
export async function resumo(
  pool: Pool,
  uid: string,
  avisoId: string,
): Promise<PessoaResumoResposta> {
  const ref = await repo.resolverPessoaPorAviso(pool, uid, avisoId)
  if (!ref) throw naoEncontrado(PESSOA_INEXISTENTE)
  const totais = await repo.totaisPorPessoa(pool, uid, ref.telefone)
  return { telefone: ref.telefone, nome_entrada: ref.nome_entrada, ...totais }
}

/**
 * Combinados da pessoa (H15.3): todos os do mesmo TELEFONE, AGRUPADOS POR NOME no servidor
 * (H15.7). A ordem dos grupos segue a 1ª aparição (a lista já vem por data desc do repo);
 * cada item exibe o nome registrado no próprio combinado (a chave do grupo).
 */
export async function combinados(
  pool: Pool,
  uid: string,
  avisoId: string,
): Promise<PessoaCombinadosResposta> {
  const ref = await repo.resolverPessoaPorAviso(pool, uid, avisoId)
  if (!ref) throw naoEncontrado(PESSOA_INEXISTENTE)
  const linhas = await repo.combinadosPorPessoa(pool, uid, ref.telefone)
  const grupos: GrupoPessoa[] = []
  const indicePorNome = new Map<string, number>()
  for (const { aviso, nome_outra_ponta } of linhas) {
    let i = indicePorNome.get(nome_outra_ponta)
    if (i === undefined) {
      i = grupos.length
      indicePorNome.set(nome_outra_ponta, i)
      grupos.push({ nome: nome_outra_ponta, itens: [] })
    }
    grupos[i]!.itens.push(aviso)
  }
  return { grupos, total: linhas.length }
}

/** Autocomplete de pessoa ao criar (H15.6): sugestões por prefixo de telefone. */
export async function buscarPorTelefone(
  pool: Pool,
  uid: string,
  prefixo: string,
): Promise<BuscarPessoaResposta> {
  const itens = await repo.buscarPorPrefixoTelefone(pool, uid, prefixo)
  return { itens }
}
