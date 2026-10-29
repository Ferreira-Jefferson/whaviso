// Regra do modulo ficha_tecnica. Sem acesso HTTP aqui; erros de dominio via shared/http_errors.
// Nenhum dado sensivel vai a log. Dinheiro nao existe neste modulo (quantidade fisica de insumo).
import { comTransacao, type Executor, type Pool } from '@whaviso/shared/db'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import type { FichaTecnicaEntrada } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

export function criarServicoFichaTecnica(pool: Pool) {
  async function exigirItem(exec: Executor, a: Ator, itemId: string): Promise<void> {
    if (!(await repo.itemDaLoja(exec, a.lojaId, itemId))) {
      throw naoEncontrado('Item nao encontrado')
    }
  }

  return {
    /** Ficha vigente (linhas ativas) do item. 404 se o item nao e da loja. */
    async obter(a: Ator, itemId: string) {
      await exigirItem(pool, a, itemId)
      const linhas = await repo.linhasAtivas(pool, a.lojaId, itemId)
      return { item_id: itemId, linhas }
    },

    /** Substitui a ficha do item pela lista informada (upsert + remocao logica do que saiu). */
    async definir(a: Ator, itemId: string, entrada: FichaTecnicaEntrada) {
      const insumoIds = entrada.linhas.map((l) => l.insumo_id)
      return comTransacao(pool, async (cx) => {
        await exigirItem(cx, a, itemId)
        if (insumoIds.length > 0) {
          const validos = await repo.contarInsumosDaLoja(cx, a.lojaId, insumoIds)
          if (validos !== insumoIds.length) {
            throw regraNegocio('insumo_invalido', 'Um ou mais insumos nao pertencem a loja')
          }
        }
        for (const l of entrada.linhas) {
          await repo.salvarLinha(cx, a.lojaId, itemId, l.insumo_id, l.quantidade)
        }
        await repo.desativarForaDe(cx, a.lojaId, itemId, insumoIds)
        await repo.registrarEvento(cx, {
          lojaId: a.lojaId,
          itemId,
          userId: a.userId,
          qtdLinhas: insumoIds.length,
        })
        const linhas = await repo.linhasAtivas(cx, a.lojaId, itemId)
        return { item_id: itemId, linhas }
      })
    },
  }
}
export type ServicoFichaTecnica = ReturnType<typeof criarServicoFichaTecnica>

/**
 * Baixa de estoque por venda de UMA unidade logica do item (funcao pura; recebe o executor, que
 * pode ser o client de uma transacao do chamador). Para cada linha ATIVA da ficha do item:
 * consumo = quantidade_por_unidade * quantidade_vendida; decrementa o insumo sem deixar negativo e
 * registra o movimento 'consumo'. Idempotente por (pedido_id, insumo_id): reexecutar o mesmo
 * pedido nao da baixa em dobro. Nao importa o modulo estoque_insumos: escreve por SQL direto,
 * respeitando os grants do role do `exec`.
 */
export async function darBaixaPorVenda(
  exec: Executor,
  p: { item_id: string; loja_id: string; quantidade_vendida: number; pedido_id: string },
): Promise<{ baixados: number; jaRegistrados: number }> {
  const linhas = await repo.linhasAtivas(exec, p.loja_id, p.item_id)
  const linhasBaixa = linhas.map((l) => ({
    insumoId: l.insumo_id,
    consumo: l.quantidade * p.quantidade_vendida,
  }))
  const baixados = await repo.baixarConsumo(exec, {
    lojaId: p.loja_id,
    pedidoId: p.pedido_id,
    linhas: linhasBaixa,
  })
  const jaRegistrados = linhasBaixa.length - baixados
  return { baixados, jaRegistrados }
}
