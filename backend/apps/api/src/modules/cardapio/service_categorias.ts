// Regras de categorias e do vinculo categoria<->grupos (heranca). Sem DELETE: remover um vinculo
// exigiria uma coluna `ativo` ou grant de DELETE (decisao pendente, ver MODULE.md); ate la o PUT
// de vinculos so acrescenta e reordena.
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { conflito, naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { categoriaSaida } from './mapeadores'
import {
  contarGruposDaLoja,
  contarItensAtivosDaCategoria,
  obterCategoria,
  vinculosDaCategoria,
  type CategoriaRow,
} from './repo'
import {
  auditar,
  gravarCategoria,
  inserirCategoria,
  neutralizarRastroAposHerdar,
  reordenar,
  upsertVinculoCategoria,
} from './repo_escrita'
import type { CategoriaSaida, Programacao } from './schemas'

async function montar(pool: Pick<Pool, 'query'>, lojaId: string, id: string): Promise<CategoriaSaida> {
  const c = await obterCategoria(pool, lojaId, id)
  if (!c) throw naoEncontrado()
  return categoriaSaida(c, await vinculosDaCategoria(pool, lojaId, id))
}

export async function criarCategoria(
  pool: Pool,
  lojaId: string,
  e: { nome: string; descricao: string | null; programacao: Programacao | null; ordem?: number | undefined },
): Promise<CategoriaSaida> {
  return comTransacao(pool, async (tx) => {
    const id = await inserirCategoria(tx, lojaId, e)
    await auditar(tx, lojaId, 'cardapio.item_alterado', 'categoria', id, { acao: 'criada' })
    return montar(tx, lojaId, id)
  })
}

export async function atualizarCategoria(
  pool: Pool,
  lojaId: string,
  id: string,
  p: Partial<Pick<CategoriaRow, 'nome' | 'descricao' | 'programacao' | 'ativo' | 'ordem'>>,
): Promise<CategoriaSaida> {
  return comTransacao(pool, async (tx) => {
    const atual = await obterCategoria(tx, lojaId, id)
    if (!atual) throw naoEncontrado()
    const novo: CategoriaRow = {
      ...atual,
      nome: p.nome ?? atual.nome,
      descricao: p.descricao === undefined ? atual.descricao : p.descricao,
      programacao: p.programacao === undefined ? atual.programacao : p.programacao,
      ativo: p.ativo ?? atual.ativo,
      ordem: p.ordem ?? atual.ordem,
    }
    // Nenhum item pode ficar sem categoria ativa.
    if (atual.ativo && !novo.ativo) {
      const n = await contarItensAtivosDaCategoria(tx, lojaId, id)
      if (n > 0) {
        throw conflito(
          'categoria_com_itens_ativos',
          `A categoria tem ${n} item(ns) ativo(s): mova ou desative os itens antes de desativar a categoria`,
        )
      }
    }
    await gravarCategoria(tx, lojaId, novo)
    await auditar(tx, lojaId, 'cardapio.item_alterado', 'categoria', id, {
      acao: 'atualizada',
      campos: Object.keys(p),
    })
    return montar(tx, lojaId, id)
  })
}

export async function reordenarCategorias(pool: Pool, lojaId: string, ids: readonly string[]): Promise<void> {
  await comTransacao(pool, async (tx) => {
    if (new Set(ids).size !== ids.length) throw regraNegocio('ids_duplicados', 'Ids repetidos na ordem')
    const n = await reordenar(tx, lojaId, 'categorias', ids)
    if (n !== ids.length) throw regraNegocio('referencia_invalida', 'Alguma categoria nao pertence a loja')
  })
}

/** Substitui (idempotente) a lista de grupos herdados pela categoria; ordem inclusa. */
export async function definirGruposDaCategoria(
  pool: Pool,
  lojaId: string,
  categoriaId: string,
  grupos: readonly { grupo_id: string; ordem: number }[],
): Promise<CategoriaSaida> {
  return comTransacao(pool, async (tx) => {
    if (!(await obterCategoria(tx, lojaId, categoriaId))) throw naoEncontrado()
    const ids = grupos.map((g) => g.grupo_id)
    if (new Set(ids).size !== ids.length) throw regraNegocio('ids_duplicados', 'Grupo repetido na lista')
    // Integridade cruzada de loja: o banco so tem FK simples, a api valida os dois lados.
    if ((await contarGruposDaLoja(tx, lojaId, ids)) !== ids.length) {
      throw regraNegocio('referencia_invalida', 'Algum grupo nao pertence a loja')
    }
    const existentes = await vinculosDaCategoria(tx, lojaId, categoriaId)
    const desejados = new Set(ids)
    if (existentes.some((v) => !desejados.has(v.grupo_id))) {
      throw regraNegocio(
        'remocao_vinculo_nao_suportada',
        'Nao e possivel remover o vinculo de um grupo da categoria; desative o grupo ou use excecao no item',
      )
    }
    const jaVinculados = new Set(existentes.map((v) => v.grupo_id))
    for (const g of grupos) {
      await upsertVinculoCategoria(tx, lojaId, categoriaId, g.grupo_id, g.ordem)
      if (!jaVinculados.has(g.grupo_id)) await neutralizarRastroAposHerdar(tx, lojaId, categoriaId, g.grupo_id)
    }
    await auditar(tx, lojaId, 'cardapio.grupo_alterado', 'categoria', categoriaId, {
      acao: 'grupos_vinculados',
      total: grupos.length,
    })
    return montar(tx, lojaId, categoriaId)
  })
}
