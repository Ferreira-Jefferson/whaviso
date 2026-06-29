// Estado da sessão do WhatsApp no banco (tabela whats_sessao, 1 linha id=1): o zap
// grava status/numero e a api (admin) lê para mostrar "conectado como X" na tela de
// Conexão. Neutro de provedor (o provider Meta grava status='conectado' ao validar o
// token/phone_id; não há QR).
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
