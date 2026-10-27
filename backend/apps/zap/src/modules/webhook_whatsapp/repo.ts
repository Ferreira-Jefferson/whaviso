import type { Pool } from '@whaviso/shared/db'

// TODO(pivo): repo do inbound de pedidos (conversa, pedido, mídia) ainda não existe.

/** Atualiza o status de entrega de um envio pelo wamid. Ignora wamid desconhecido. */
export async function atualizarEntrega(
  pool: Pool,
  wamid: string,
  status: 'sent' | 'delivered' | 'read' | 'failed',
  erro?: string,
): Promise<void> {
  await pool.query(
    `update public.envios set entrega_status=$2, erro=coalesce($3, erro) where wamid=$1`,
    [wamid, status, erro ?? null],
  )
}
