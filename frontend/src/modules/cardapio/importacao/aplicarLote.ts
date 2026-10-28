// Aplica o LOTE aprovado no cardapio, pelos endpoints REST do modulo cardapio (HTTP + contrato
// _generated; nao importa o slice cardapio). Ordem: categoria -> itens -> grupos (com opcoes) do
// item -> vinculo grupo/item (excecao incluir=true). Idempotente por retomada: o `Progresso` guarda
// os ids ja criados, entao uma nova tentativa depois de falha pula o que ja existe e nao duplica.
import { apiClient } from '@/shared/api_client'
import {
  CategoriaSaida,
  GrupoMutacaoSaida,
  ItemMutacaoSaida,
  ItemSaida,
} from '@/shared/contracts/_generated/cardapio'
import type { CardapioLote } from '@/shared/contracts/_generated/cardapio_importacao'

interface ProgressoItem {
  itemId: string
  /** Ids dos grupos ja criados, na ordem do lote. */
  grupoIds: string[]
  vinculado: boolean
}

export interface Progresso {
  categorias: Map<number, string>
  itens: Map<string, ProgressoItem>
}

export function novoProgresso(): Progresso {
  return { categorias: new Map(), itens: new Map() }
}

export function totalDeItens(lote: CardapioLote): number {
  return lote.categorias.reduce((n, c) => n + c.itens.length, 0)
}

/** Cria tudo que falta. `aoItem(feitos)` e chamado a cada item concluido (para a barra de progresso). */
export async function aplicarLote(
  lote: CardapioLote,
  progresso: Progresso,
  aoItem: (feitos: number) => void,
): Promise<void> {
  let feitos = 0
  for (const [ci, categoria] of lote.categorias.entries()) {
    let categoriaId = progresso.categorias.get(ci)
    if (!categoriaId) {
      const criada = await apiClient.post<{ id: string }>('/cardapio/categorias', {
        body: { nome: categoria.nome, descricao: categoria.descricao },
        schema: CategoriaSaida,
      })
      categoriaId = criada.id
      progresso.categorias.set(ci, categoriaId)
    }

    for (const [ii, item] of categoria.itens.entries()) {
      const chave = `${ci}:${ii}`
      let p = progresso.itens.get(chave)
      if (!p) {
        const criado = await apiClient.post<{ id: string }>('/cardapio/itens', {
          body: {
            categoria_id: categoriaId,
            nome: item.nome,
            descricao: item.descricao,
            preco_centavos: item.preco_centavos,
          },
          schema: ItemMutacaoSaida,
        })
        p = { itemId: criado.id, grupoIds: [], vinculado: false }
        progresso.itens.set(chave, p)
      }

      for (const grupo of item.grupos.slice(p.grupoIds.length)) {
        const criado = await apiClient.post<{ id: string }>('/cardapio/grupos', {
          body: {
            nome: grupo.nome,
            tipo: grupo.tipo,
            obrigatorio: grupo.obrigatorio,
            min_escolhas: grupo.min_escolhas,
            max_escolhas: grupo.max_escolhas,
            opcoes: grupo.opcoes.map((o) => ({ nome: o.nome, preco_centavos: o.preco_centavos })),
          },
          schema: GrupoMutacaoSaida,
        })
        p.grupoIds.push(criado.id)
      }

      if (!p.vinculado && p.grupoIds.length > 0) {
        await apiClient.put(`/cardapio/itens/${p.itemId}/grupos`, {
          body: { excecoes: p.grupoIds.map((grupo_id, ordem) => ({ grupo_id, incluir: true, ordem })) },
          schema: ItemSaida,
        })
      }
      p.vinculado = true
      feitos += 1
      aoItem(feitos)
    }
  }
}
