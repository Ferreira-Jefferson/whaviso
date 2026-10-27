// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Estoque e contagem (inteiro), nunca dinheiro. Toda mudanca de contagem grava um movimento.
import { comTransacao, type Pool } from '@whaviso/shared/db'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import type { EstoqueBusca, EstoqueControle, EstoqueMovimentoNovo } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

const LIMITE_HISTORICO = 100

export function criarServicoEstoque(pool: Pool) {
  async function existente(a: Ator, id: string) {
    const item = await repo.obterItem(pool, a.lojaId, id)
    if (!item) throw naoEncontrado('Item nao encontrado')
    return item
  }

  return {
    /** Itens com controle de estoque; `somente_baixos=true` corta pelo limiar. */
    async listar(a: Ator, q: EstoqueBusca) {
      const itens = await repo.listarComControle(pool, a.lojaId, {
        somenteBaixos: q.somente_baixos === 'true',
        limiar: q.limiar,
      })
      return { itens }
    },

    async detalhe(a: Ator, id: string) {
      return existente(a, id)
    },

    async historico(a: Ator, id: string) {
      await existente(a, id)
      return { itens: await repo.listarMovimentos(pool, a.lojaId, id, LIMITE_HISTORICO) }
    },

    /**
     * Liga/desliga o controle e, opcionalmente, fixa a contagem.
     * `controla_estoque=false` zera a contagem (NULL). Mudanca para contagem finita grava 'ajuste'.
     */
    async definirControle(a: Ator, id: string, entrada: EstoqueControle) {
      return comTransacao(pool, async (cli) => {
        const atual = await repo.travarContagem(cli, a.lojaId, id)
        if (!atual) throw naoEncontrado('Item nao encontrado')

        let quantidade: number | null
        if (!entrada.controla_estoque) {
          quantidade = null
        } else if (entrada.quantidade_disponivel !== undefined) {
          quantidade = entrada.quantidade_disponivel
        } else {
          quantidade = atual.quantidade_disponivel
        }

        const item = await repo.definirControle(cli, a.lojaId, id, {
          controla_estoque: entrada.controla_estoque,
          quantidade_disponivel: quantidade,
        })
        if (!item) throw naoEncontrado('Item nao encontrado')

        // Auditoria: toda contagem finita que muda vira um lancamento de ajuste.
        if (quantidade !== null && quantidade !== atual.quantidade_disponivel) {
          await repo.registrarMovimento(cli, {
            lojaId: a.lojaId,
            itemId: id,
            tipo: 'ajuste',
            quantidade,
            quantidadeResultante: quantidade,
            motivo: 'definicao de controle',
            userId: a.userId,
          })
        }
        return item
      })
    },

    /**
     * Lancamento manual. `entrada`/`saida` somam/subtraem da contagem; `ajuste` fixa a contagem.
     * Nunca deixa a contagem negativa (saida alem do disponivel = 422). Grava o movimento.
     */
    async movimentar(a: Ator, id: string, entrada: EstoqueMovimentoNovo) {
      return comTransacao(pool, async (cli) => {
        const atual = await repo.travarContagem(cli, a.lojaId, id)
        if (!atual) throw naoEncontrado('Item nao encontrado')
        if (!atual.controla_estoque) {
          throw regraNegocio('estoque_sem_controle', 'Ligue o controle de estoque do item antes de lancar')
        }

        let resultante: number
        if (entrada.tipo === 'ajuste') {
          resultante = entrada.quantidade
        } else {
          if (atual.quantidade_disponivel === null) {
            throw regraNegocio(
              'estoque_ilimitado',
              'Item com estoque ilimitado; use ajuste para fixar uma contagem',
            )
          }
          if (entrada.tipo === 'entrada') {
            resultante = atual.quantidade_disponivel + entrada.quantidade
          } else {
            resultante = atual.quantidade_disponivel - entrada.quantidade
            if (resultante < 0) {
              throw regraNegocio('estoque_insuficiente', 'Saida maior que a contagem disponivel')
            }
          }
        }

        await repo.atualizarQuantidade(cli, a.lojaId, id, resultante)
        return repo.registrarMovimento(cli, {
          lojaId: a.lojaId,
          itemId: id,
          tipo: entrada.tipo,
          quantidade: entrada.quantidade,
          quantidadeResultante: resultante,
          motivo: entrada.motivo ?? null,
          userId: a.userId,
        })
      })
    },
  }
}

export type ServicoEstoque = ReturnType<typeof criarServicoEstoque>
