import type { Pool } from '@whaviso/shared/db'
import { decidirReagendamento } from '../../shared/retry'

/** Uma recarga reivindicada da outbox de billing (notificacoes_billing 0060). */
export interface RecargaClaim {
  id: string
  profile_id: string
  telefone_alvo: string
  quantidade: number
  valor_centavos: number
  tentativas: number
}

const LIMITE_CLAIM = 10

/** Reseta linhas travadas em 'processando' há mais de 10 min (crash-safety). */
export async function ressuscitarTravados(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(
    `update public.notificacoes_billing set status='agendado'
     where status='processando' and criado_em < now() - interval '10 minutes'`,
  )
  return rowCount ?? 0
}

/**
 * Claim atômico das recargas devidas (FOR UPDATE SKIP LOCKED). Diferente do
 * notificar_cobrador, NÃO há espaçamento de 10min nem coalescing: o recibo de pagamento
 * deve sair na hora. Só respeita a janela de retry (proxima_tentativa_em).
 */
export async function reivindicar(pool: Pool): Promise<RecargaClaim[]> {
  const { rows } = await pool.query<RecargaClaim>(
    `update public.notificacoes_billing set status='processando'
     where id in (
       select id from public.notificacoes_billing n
       where n.status='agendado'
         and (n.proxima_tentativa_em is null or n.proxima_tentativa_em <= now())
       order by n.criado_em
       limit ${LIMITE_CLAIM}
       for update skip locked
     )
     returning id, profile_id, telefone_alvo, quantidade, valor_centavos, tentativas`,
  )
  return rows
}

export async function marcarEnviado(pool: Pool, id: string, wamid: string): Promise<void> {
  await pool.query(
    `update public.notificacoes_billing set status='enviado', wamid=$2, enviado_em=now(), erro=null where id=$1`,
    [id, wamid],
  )
}

/**
 * Falta de template ativo OU de chave Pix configurada para a linha já reivindicada: NÃO é
 * falha de envio. Devolve a 'agendado' com motivo VISÍVEL e RECUPERÁVEL (o owner vê em
 * /admin), sem tocar tentativas e sem PII. Volta a drenar assim que configurar.
 */
export async function devolverAguardando(pool: Pool, id: string, motivo: string): Promise<void> {
  await pool.query(
    `update public.notificacoes_billing set status='agendado', erro=$2 where id=$1`,
    [id, motivo],
  )
}

export async function marcarFalhou(pool: Pool, id: string, erro: string): Promise<void> {
  await pool.query(
    `update public.notificacoes_billing set status='falhou', tentativas=tentativas+1, erro=$2 where id=$1`,
    [id, erro],
  )
}

/**
 * Falha transitória: reagenda com intervalo aleatório 20-60s (shared/retry) ou falha de vez
 * após MAX_TENTATIVAS (3). Mesma política do notificar_cobrador/enviar_lembretes.
 */
export async function reagendarOuFalhar(
  pool: Pool,
  id: string,
  tentativasAtuais: number,
  erro: string,
): Promise<'reagendado' | 'falhou'> {
  const d = decidirReagendamento(tentativasAtuais)
  if (d.acao === 'falhou') {
    await marcarFalhou(pool, id, erro)
    return 'falhou'
  }
  await pool.query(
    `update public.notificacoes_billing
       set status='agendado', tentativas=$2, proxima_tentativa_em=now() + ($3 || ' seconds')::interval, erro=$4
     where id=$1`,
    [id, d.proxima, String(d.segundos), erro],
  )
  return 'reagendado'
}
