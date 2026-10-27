// Ganchos de transacao por requisicao (opt-in). Hoje o isolamento de loja e feito na
// aplicacao (escopo de F3); este gancho existe para adotar RLS por GUC depois sem mudar
// consumidores: `comTransacao(pool, fn, { aoIniciar: gancharGucs({ 'app.loja_id': id }) })`.
import { consultar, sql, type PoolClient } from '@whaviso/shared/db'

const NOME_GUC = /^[a-z_]+(\.[a-z_]+)+$/

/** Aplica `set_config(nome, valor, true)` (local a transacao). Valores sempre parametrizados. */
export function gancharGucs(gucs: Record<string, string>) {
  return async (client: PoolClient): Promise<void> => {
    for (const [nome, valor] of Object.entries(gucs)) {
      if (!NOME_GUC.test(nome)) throw new Error('nome de GUC invalido')
      await consultar(client, sql`select set_config(${nome}, ${valor}, true)`)
    }
  }
}
