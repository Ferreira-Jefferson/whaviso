// Poller de comandos de pareamento do Baileys (tabela whats_sessao): a api (admin)
// enfileira 'conectar'/'desconectar' e o zap consome aqui. O estado da sessão em si
// (gravarSessao/StatusSessao) é neutro e vive em shared/sessao.
import type { Pool } from '@whaviso/shared/db'

export type ComandoSessao = 'conectar' | 'desconectar'

// Lê e CONSUME o comando enfileirado pela api (admin) de forma atômica: zera a
// coluna e devolve o valor anterior. Limpar antes de executar evita que o poller
// dispare o mesmo comando de novo enquanto a ação ainda está em andamento.
export async function lerEConsumirComando(pool: Pool): Promise<ComandoSessao | null> {
  const { rows } = await pool.query<{ comando: ComandoSessao | null }>(
    `with atual as (
       select comando from public.whats_sessao where id = 1 for update
     )
     update public.whats_sessao s
       set comando = null, comando_em = null
       from atual
       where s.id = 1 and atual.comando is not null
       returning atual.comando as comando`,
  )
  return rows[0]?.comando ?? null
}
