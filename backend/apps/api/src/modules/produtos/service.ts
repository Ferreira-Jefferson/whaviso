import type { Pool } from '@whaviso/shared/db'
import { comTransacao } from '@whaviso/shared/db'
import type { AtualizarProdutoBody, CriarProdutoBody, Produto } from '@whaviso/shared/contracts'
import { conflito, naoEncontrado } from '../../shared/http_errors'
import * as repo from './repo'

/** Violação da unique (profile_id, lower(nome)) dos produtos ativos (H17.1/H17.2). */
function ehNomeDuplicado(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505'
}

const DUPLICADO = 'Já existe um produto com esse nome.'

export function listar(pool: Pool, uid: string): Promise<Produto[]> {
  return repo.listar(pool, uid)
}

export async function criar(pool: Pool, uid: string, body: CriarProdutoBody): Promise<Produto> {
  try {
    return await repo.criar(pool, uid, body.nome, body.preco_venda_centavos)
  } catch (e) {
    if (ehNomeDuplicado(e)) throw conflito('produto_duplicado', DUPLICADO)
    throw e
  }
}

/**
 * Atualiza o produto (H17.2/H17.3/H17.4). Numa transação: aplica os campos e, SÓ quando o
 * NOME muda, propaga o novo nome para a `descricao` dos itens que referenciam o produto
 * (H17.3), escopado ao dono. Mudar o preço ou arquivar NÃO propaga (snapshot congelado).
 */
export async function atualizar(
  pool: Pool,
  uid: string,
  id: string,
  body: AtualizarProdutoBody,
): Promise<Produto> {
  return comTransacao(pool, async (cli) => {
    const atual = await repo.buscar(cli, uid, id)
    if (!atual) throw naoEncontrado('Produto não encontrado')
    try {
      const atualizado = await repo.atualizar(cli, uid, id, {
        nome: body.nome,
        preco_venda_centavos: body.preco_venda_centavos,
        arquivado: body.arquivado,
      })
      // H17.3: propaga o rótulo só quando o nome mudou de fato (evita reescrever itens à toa).
      if (body.nome !== undefined && body.nome !== atual.nome) {
        await repo.propagarNome(cli, uid, id, body.nome)
      }
      return atualizado ?? atual
    } catch (e) {
      if (ehNomeDuplicado(e)) throw conflito('produto_duplicado', DUPLICADO)
      throw e
    }
  })
}
