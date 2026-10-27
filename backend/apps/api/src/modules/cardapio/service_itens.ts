// Regras de itens e das EXCECOES de grupos por item (acrescentar / remover o herdado).
//
// Sem DELETE no grant, o PUT de excecoes reconcilia por neutralizacao: uma linha de item_grupos so
// vale como excecao "real" quando acrescenta o que a categoria nao tem (incluir=true) ou remove o
// que ela tem (incluir=false). Linha omitida do PUT vira neutra (incluir = herdado), sem efeito no
// resolvedor, e some das saidas. Ao mover o item de categoria, as excecoes sao resetadas.
import { comTransacao, type Executor, type Pool } from '@whaviso/shared/db'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import { itemSaida } from './mapeadores'
import { excecoesReais } from './resolvedor'
import {
  contarGruposDaLoja,
  obterCategoria,
  obterItem,
  vinculosDaCategoria,
  vinculosDoItem,
  type ItemRow,
} from './repo'
import {
  auditar,
  gravarItem,
  inserirItem,
  neutralizarVinculoItem,
  upsertVinculoItem,
} from './repo_escrita'
import type { ExcecaoItem, ItemSaida } from './schemas'

/** Hosts permitidos para `imagem_url` (sufixo com fronteira de ponto). Somente https. */
export const HOSTS_IMAGEM_PERMITIDOS = ['supabase.co', 'supabase.in'] as const

export function validarImagemUrl(url: string | null): void {
  if (url === null) return
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw regraNegocio('imagem_url_invalida', 'URL de imagem invalida')
  }
  const host = u.hostname.toLowerCase()
  const ok =
    u.protocol === 'https:' &&
    u.username === '' &&
    u.password === '' &&
    u.port === '' &&
    HOSTS_IMAGEM_PERMITIDOS.some((h) => host === h || host.endsWith(`.${h}`))
  if (!ok) throw regraNegocio('imagem_url_invalida', 'Imagem deve ser https de um host permitido')
}

export type ItemMutacao = ItemSaida & { excecoes_resetadas: boolean }

async function categoriaAtivaOu422(exec: Executor, lojaId: string, categoriaId: string): Promise<void> {
  const c = await obterCategoria(exec, lojaId, categoriaId)
  if (!c) throw regraNegocio('referencia_invalida', 'Categoria nao pertence a loja')
  if (!c.ativo) throw regraNegocio('categoria_inativa', 'O item precisa de uma categoria ativa')
}

async function montar(exec: Executor, lojaId: string, id: string): Promise<ItemSaida> {
  const i = await obterItem(exec, lojaId, id)
  if (!i) throw naoEncontrado()
  const [doCat, doItem] = await Promise.all([
    vinculosDaCategoria(exec, lojaId, i.categoria_id),
    vinculosDoItem(exec, lojaId, id),
  ])
  return itemSaida(i, doCat, doItem, new Date())
}

export async function criarItem(
  pool: Pool,
  lojaId: string,
  e: {
    categoria_id: string
    nome: string
    descricao: string | null
    preco_centavos: number
    imagem_url: string | null
    sugerivel: boolean
    ordem?: number | undefined
  },
): Promise<ItemMutacao> {
  validarImagemUrl(e.imagem_url)
  return comTransacao(pool, async (tx) => {
    await categoriaAtivaOu422(tx, lojaId, e.categoria_id)
    const id = await inserirItem(tx, lojaId, e)
    await auditar(tx, lojaId, 'cardapio.item_alterado', 'item', id, { acao: 'criado' })
    return { ...(await montar(tx, lojaId, id)), excecoes_resetadas: false }
  })
}

export async function atualizarItem(
  pool: Pool,
  lojaId: string,
  id: string,
  p: Partial<Omit<ItemRow, 'id' | 'esgotado_ate'>>,
): Promise<ItemMutacao> {
  if (p.imagem_url !== undefined) validarImagemUrl(p.imagem_url)
  return comTransacao(pool, async (tx) => {
    const atual = await obterItem(tx, lojaId, id)
    if (!atual) throw naoEncontrado()
    const novo: ItemRow = {
      ...atual,
      categoria_id: p.categoria_id ?? atual.categoria_id,
      nome: p.nome ?? atual.nome,
      descricao: p.descricao === undefined ? atual.descricao : p.descricao,
      preco_centavos: p.preco_centavos ?? atual.preco_centavos,
      imagem_url: p.imagem_url === undefined ? atual.imagem_url : p.imagem_url,
      sugerivel: p.sugerivel ?? atual.sugerivel,
      ativo: p.ativo ?? atual.ativo,
      ordem: p.ordem ?? atual.ordem,
    }
    const moveu = novo.categoria_id !== atual.categoria_id
    // Item ativo precisa de categoria ativa (criar, mover, ou reativar o item).
    if (moveu || (novo.ativo && !atual.ativo)) await categoriaAtivaOu422(tx, lojaId, novo.categoria_id)

    let resetou = false
    if (moveu) {
      const [antigaCat, novaCat, vinculos] = await Promise.all([
        vinculosDaCategoria(tx, lojaId, atual.categoria_id),
        vinculosDaCategoria(tx, lojaId, novo.categoria_id),
        vinculosDoItem(tx, lojaId, id),
      ])
      const herdadosNovos = new Set(novaCat.map((v) => v.grupo_id))
      resetou = excecoesReais(new Set(antigaCat.map((v) => v.grupo_id)), vinculos).length > 0
      // Excecoes pertencem ao contexto da categoria antiga: todas viram neutras na nova.
      for (const v of vinculos) {
        await neutralizarVinculoItem(tx, lojaId, id, v.grupo_id, herdadosNovos.has(v.grupo_id))
      }
    }
    await gravarItem(tx, lojaId, novo)
    await auditar(tx, lojaId, 'cardapio.item_alterado', 'item', id, {
      acao: 'atualizado',
      campos: Object.keys(p),
      excecoes_resetadas: resetou,
    })
    return { ...(await montar(tx, lojaId, id)), excecoes_resetadas: resetou }
  })
}

/** Registra APENAS excecoes; rejeita redundantes (acrescentar o ja herdado, remover o nao herdado). */
export async function definirExcecoesDoItem(
  pool: Pool,
  lojaId: string,
  itemId: string,
  excecoes: readonly ExcecaoItem[],
): Promise<ItemSaida> {
  return comTransacao(pool, async (tx) => {
    const item = await obterItem(tx, lojaId, itemId)
    if (!item) throw naoEncontrado()
    const ids = excecoes.map((x) => x.grupo_id)
    if (new Set(ids).size !== ids.length) throw regraNegocio('ids_duplicados', 'Grupo repetido na lista')
    if ((await contarGruposDaLoja(tx, lojaId, ids)) !== ids.length) {
      throw regraNegocio('referencia_invalida', 'Algum grupo nao pertence a loja')
    }
    const doCat = await vinculosDaCategoria(tx, lojaId, item.categoria_id)
    const herdados = new Set(doCat.map((v) => v.grupo_id))
    for (const x of excecoes) {
      if (x.incluir === herdados.has(x.grupo_id)) {
        throw regraNegocio(
          'excecao_redundante',
          x.incluir
            ? 'O grupo ja e herdado da categoria: nao ha o que acrescentar'
            : 'O grupo nao e herdado da categoria: nao ha o que remover',
        )
      }
    }
    const desejados = new Set(ids)
    for (const v of await vinculosDoItem(tx, lojaId, itemId)) {
      if (!desejados.has(v.grupo_id)) await neutralizarVinculoItem(tx, lojaId, itemId, v.grupo_id, herdados.has(v.grupo_id))
    }
    for (const x of excecoes) await upsertVinculoItem(tx, lojaId, itemId, x)
    await auditar(tx, lojaId, 'cardapio.item_alterado', 'item', itemId, {
      acao: 'excecoes_definidas',
      total: excecoes.length,
    })
    return montar(tx, lojaId, itemId)
  })
}
