// Selagem do contexto da conversa (SEC-063). O `ConversaCtx` nasce AQUI, no servidor, a partir da
// linha da conversa (que o motor resolveu do phone_number_id do inbound). Nunca de texto do
// cliente nem de saida do modelo; o objeto e congelado e o modelo nunca o enxerga.
import { consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { ConversaCtx } from '@whaviso/shared/contracts'

/** Sela a partir de valores JA resolvidos pelo servidor (ex.: dentro do claim do motor). */
export function selarConversaCtx(v: { loja_id: string; cliente_id: string; conversa_id: string }): ConversaCtx {
  return Object.freeze({ loja_id: v.loja_id, cliente_id: v.cliente_id, conversa_id: v.conversa_id })
}

/** Carrega e sela o ctx pela conversa. null se a conversa nao existe ou nao esta com a IA. */
export async function selarCtxDaConversa(exec: Executor, conversaId: string): Promise<ConversaCtx | null> {
  const c = await consultarUm<{ id: string; loja_id: string; cliente_id: string }>(
    exec,
    sql`select id, loja_id, cliente_id from public.conversas where id = ${conversaId} and status = 'ia'`,
  )
  return c ? selarConversaCtx({ loja_id: c.loja_id, cliente_id: c.cliente_id, conversa_id: c.id }) : null
}
