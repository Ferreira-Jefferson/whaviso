// Consumo de insumo por venda (ficha tecnica). Funcao PURA sobre um Executor: nao conhece HTTP
// e nao lanca erro de dominio; devolve um resultado discriminado para o chamador decidir.
//
// Roda no fluxo do atendente (role whaviso_atendente: SELECT/UPDATE(quantidade_atual) em insumos,
// INSERT em movimentos_insumo). Nunca deixa o saldo negativo: se faltar insumo, NAO aplica e
// devolve `aplicado: false` com o motivo. Chame dentro de uma transacao (exec = client do BEGIN)
// para que o decremento do saldo e a linha de movimento 'consumo' sejam atomicos.
import type { Executor } from '@whaviso/shared/db'
import * as repo from './repo'

export interface ConsumoEntrada {
  insumo_id: string
  loja_id: string
  quantidade: number
  pedido_id?: string | null
  user_id?: string | null
}

export type ResultadoConsumo =
  | { aplicado: true; quantidade_resultante: number; movimento_id: string }
  | { aplicado: false; motivo: 'insumo_nao_encontrado' | 'quantidade_invalida' | 'estoque_insuficiente' }

export async function consumirInsumo(exec: Executor, e: ConsumoEntrada): Promise<ResultadoConsumo> {
  if (!(e.quantidade > 0)) return { aplicado: false, motivo: 'quantidade_invalida' }

  const existe = await repo.obterParaMovimento(exec, e.loja_id, e.insumo_id)
  if (!existe) return { aplicado: false, motivo: 'insumo_nao_encontrado' }

  // Guarda numeric-exata no SQL: so decrementa se sobrar saldo (nunca negativo).
  const saldo = await repo.somarSaldo(exec, e.loja_id, e.insumo_id, -e.quantidade)
  if (!saldo) return { aplicado: false, motivo: 'estoque_insuficiente' }

  const mov = await repo.inserirMovimento(exec, {
    lojaId: e.loja_id,
    insumoId: e.insumo_id,
    tipo: 'consumo',
    quantidade: e.quantidade,
    quantidadeResultante: saldo.quantidade_resultante,
    pedidoId: e.pedido_id ?? null,
    userId: e.user_id ?? null,
  })
  return { aplicado: true, quantidade_resultante: saldo.quantidade_resultante, movimento_id: mov.id }
}
