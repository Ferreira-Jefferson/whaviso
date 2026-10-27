// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors. O saldo nunca
// fica negativo e CADA mudanca de quantidade registra um movimento com quantidade_resultante.
import type { Pool } from '@whaviso/shared/db'
import { comTransacao } from '@whaviso/shared/db'
import { naoEncontrado, regraNegocio } from '../../shared/http_errors'
import * as repo from './repo'
import type { InsumoNovo, InsumoPatch, MovimentoInsumoNovo } from './schemas'

export interface Ator {
  lojaId: string
  userId: string
}

export function criarServicoEstoque(pool: Pool) {
  const evento = (a: Ator, tipo: string, entidadeId: string) =>
    repo.registrarEvento(pool, { lojaId: a.lojaId, tipo, entidadeId, userId: a.userId })

  async function existente(a: Ator, id: string) {
    const i = await repo.obter(pool, a.lojaId, id)
    if (!i) throw naoEncontrado('Insumo nao encontrado')
    return i
  }

  return {
    async listar(a: Ator, incluirInativos: boolean) {
      return { itens: await repo.listar(pool, a.lojaId, incluirInativos) }
    },

    async baixoEstoque(a: Ator) {
      return { itens: await repo.listarBaixoEstoque(pool, a.lojaId) }
    },

    async detalhe(a: Ator, id: string) {
      return existente(a, id)
    },

    async movimentos(a: Ator, id: string, limite: number) {
      await existente(a, id)
      return { itens: await repo.listarMovimentos(pool, a.lojaId, id, limite) }
    },

    /** Cria o insumo; saldo inicial > 0 gera um movimento 'entrada' na mesma transacao. */
    async criar(a: Ator, d: InsumoNovo) {
      const insumo = await comTransacao(pool, async (tx) => {
        const i = await repo.inserir(tx, a.lojaId, d)
        if (d.quantidade_inicial > 0) {
          await repo.inserirMovimento(tx, {
            lojaId: a.lojaId,
            insumoId: i.id,
            tipo: 'entrada',
            quantidade: d.quantidade_inicial,
            quantidadeResultante: i.quantidade_atual,
            motivo: 'saldo inicial',
            userId: a.userId,
          })
        }
        return i
      })
      await evento(a, 'insumo.criado', insumo.id)
      return insumo
    },

    async atualizar(a: Ator, id: string, p: InsumoPatch) {
      const i = await repo.atualizar(pool, a.lojaId, id, p)
      if (!i) throw naoEncontrado('Insumo nao encontrado')
      await evento(a, 'insumo.atualizado', id)
      return i
    },

    /** Lanca um movimento do painel (entrada/saida/ajuste) atomico com a mudanca de saldo. */
    async movimentar(a: Ator, m: MovimentoInsumoNovo) {
      const resultado = await comTransacao(pool, async (tx) => {
        const existe = await repo.obterParaMovimento(tx, a.lojaId, m.insumo_id)
        if (!existe) return { erro: 'nao_encontrado' as const }

        let saldo: { quantidade_resultante: number } | null
        if (m.tipo === 'entrada') {
          saldo = await repo.somarSaldo(tx, a.lojaId, m.insumo_id, m.quantidade)
        } else if (m.tipo === 'saida') {
          saldo = await repo.somarSaldo(tx, a.lojaId, m.insumo_id, -m.quantidade)
        } else {
          saldo = await repo.definirSaldo(tx, a.lojaId, m.insumo_id, m.quantidade)
        }
        if (!saldo) return { erro: 'estoque_insuficiente' as const }

        const movimento = await repo.inserirMovimento(tx, {
          lojaId: a.lojaId,
          insumoId: m.insumo_id,
          tipo: m.tipo,
          quantidade: m.quantidade,
          quantidadeResultante: saldo.quantidade_resultante,
          motivo: m.motivo ?? null,
          userId: a.userId,
        })
        const insumo = await repo.obter(tx, a.lojaId, m.insumo_id)
        return { insumo: insumo!, movimento }
      })

      if ('erro' in resultado) {
        if (resultado.erro === 'nao_encontrado') throw naoEncontrado('Insumo nao encontrado')
        throw regraNegocio('estoque_insuficiente', 'Saldo insuficiente para a saida')
      }
      await evento(a, 'insumo.movimentado', resultado.movimento.insumo_id)
      return resultado
    },
  }
}

export type ServicoEstoque = ReturnType<typeof criarServicoEstoque>
