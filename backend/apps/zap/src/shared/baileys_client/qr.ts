// Estado da sessão do WhatsApp no banco (tabela whats_sessao, 1 linha id=1): o zap
// grava status/QR e a api (admin) lê para mostrar "escaneie o QR" / "conectado como X".
// Resolve o pareamento numa VPS headless sem expor endpoint extra.
import type { Pool } from '@whaviso/shared/db'

export type StatusSessao = 'desconectado' | 'aguardando_qr' | 'conectado'

export async function gravarSessao(
  pool: Pool,
  dados: { status: StatusSessao; numero?: string | null; qr?: string | null },
): Promise<void> {
  await pool.query(
    `insert into public.whats_sessao (id, status, numero, qr, atualizado_em)
     values (1, $1, $2, $3, now())
     on conflict (id) do update
       set status=excluded.status, numero=excluded.numero, qr=excluded.qr, atualizado_em=now()`,
    [dados.status, dados.numero ?? null, dados.qr ?? null],
  )
}

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
