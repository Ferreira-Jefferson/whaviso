import type { Pool } from '@whaviso/shared/db'

export interface TesteClaim {
  id: string
  telefone: string
  texto: string
}

// Lote pequeno: o mini-chat é de baixíssimo volume (uma pessoa testando), então 5
// sobra (a Meta tem rate-limit próprio, não precisamos serializar aqui).
const LIMITE_CLAIM = 5

/** Claim atômico das mensagens de saída agendadas (FOR UPDATE SKIP LOCKED). */
export async function reivindicar(pool: Pool): Promise<TesteClaim[]> {
  const { rows } = await pool.query<TesteClaim>(
    `update public.whats_teste_mensagens set status='processando'
     where id in (
       select id from public.whats_teste_mensagens
       where direcao='saida' and status='agendado'
       order by criado_em
       limit ${LIMITE_CLAIM}
       for update skip locked
     )
     returning id, telefone, texto`,
  )
  return rows
}

export async function marcarEnviado(pool: Pool, id: string, wamid: string): Promise<void> {
  await pool.query(
    `update public.whats_teste_mensagens set status='enviado', enviado_em=now(), wamid=$2, erro=null where id=$1`,
    [id, wamid],
  )
}

export async function marcarFalhou(pool: Pool, id: string, erro: string): Promise<void> {
  await pool.query(
    `update public.whats_teste_mensagens set status='falhou', erro=$2 where id=$1`,
    [id, erro],
  )
}

/** Número de teste configurado (E.164) ou null. */
export async function numeroDeTeste(pool: Pool): Promise<string | null> {
  const { rows } = await pool.query<{ telefone: string | null }>(
    `select telefone from public.whats_teste_config where id=1`,
  )
  return rows[0]?.telefone ?? null
}

/** Grava uma resposta recebida do número de teste no histórico do mini-chat. */
export async function gravarEntrada(
  pool: Pool,
  telefone: string,
  texto: string,
  wamid: string,
): Promise<void> {
  await pool.query(
    `insert into public.whats_teste_mensagens (direcao, telefone, texto, status, wamid, enviado_em)
     values ('entrada', $1, $2, 'recebido', $3, now())`,
    [telefone, texto, wamid],
  )
}
