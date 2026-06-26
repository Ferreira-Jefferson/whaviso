// Especialista de CRÉDITOS do zap (Épico 11, modelo de carteira). O zap é quem CONSOME no
// disparo (reservado -> consumido), DEVOLVE o não aceito (convite recusado/expirado),
// REATIVA o hold (desregistrado -> programado dentro de 24h) e roda o JOB de devolução do
// hold de 24h. A api é dona da reserva (na ativação) e do crédito do owner; aqui o zap só
// movimenta o que o ciclo de envio toca. Toda movimentação trava a carteira (for update) e
// SEMPRE lança no livro-razão append-only (creditos_lancamentos) junto da atualização.
//
// Vive em shared/ porque módulo nunca importa módulo: enviar_lembretes, webhook_whatsapp e
// o scheduler chamam estas funções, não umas às outras.
import type { Pool, PoolClient } from '@whaviso/shared/db'
import { comTransacao } from '@whaviso/shared/db'

type AtorLancamento = 'sistema' | 'owner' | 'usuario'
type TipoLancamento = 'reserva' | 'consumo' | 'devolucao' | 'hold'

/** Lança um movimento no livro-razão (append-only). Quantidade sempre positiva. */
async function lancar(
  cli: PoolClient,
  args: {
    uid: string
    tipo: TipoLancamento
    quantidade: number
    refTipo?: 'aviso' | 'ocorrencia' | null
    refId?: string | null
    ator?: AtorLancamento
  },
): Promise<void> {
  await cli.query(
    `insert into public.creditos_lancamentos
       (profile_id, tipo, quantidade, ref_tipo, ref_id, ator)
     values ($1, $2, $3, $4, $5, $6)`,
    [args.uid, args.tipo, args.quantidade, args.refTipo ?? null, args.refId ?? null, args.ator ?? 'sistema'],
  )
}

/** Resolve o uid do CRIADOR (dono da carteira) de um aviso e a referência do lançamento. */
async function donoEref(
  cli: PoolClient,
  avisoId: string,
  ocorrenciaId: string | null,
): Promise<{ uid: string; refTipo: 'aviso' | 'ocorrencia'; refId: string } | null> {
  const { rows } = await cli.query<{ uid: string | null }>(
    `select case when criador_papel = 'cobrador' then cobrador_id else devedor_profile_id end as uid
       from public.avisos where id = $1`,
    [avisoId],
  )
  const uid = rows[0]?.uid ?? null
  if (!uid) return null
  return ocorrenciaId
    ? { uid, refTipo: 'ocorrencia', refId: ocorrenciaId }
    : { uid, refTipo: 'aviso', refId: avisoId }
}

/**
 * CONSOME 1 crédito no disparo de um lembrete (H11.5), IDEMPOTENTE: move reservado ->
 * consumido e lança 'consumo' SOMENTE se ainda não houve um 'consumo' para esta unidade
 * (ocorrência no recorrente; o próprio aviso no simples). Assim as 4 etapas de uma mesma
 * ocorrência consomem 1 só vez (no 1º envio que sai). Consumido é permanente. Roda na sua
 * própria transação (o disparo do zap não é transacional). Resolve o dono internamente.
 */
export async function consumirNoDisparo(
  pool: Pool,
  avisoId: string,
  ocorrenciaId: string | null,
): Promise<void> {
  await comTransacao(pool, async (cli) => {
    const ref = await donoEref(cli, avisoId, ocorrenciaId)
    if (!ref) return
    // Trava a carteira (serializa) ANTES de checar a idempotência (evita corrida de duas
    // etapas da mesma ocorrência saindo simultaneamente).
    await cli.query(`select 1 from public.creditos_carteira where profile_id = $1 for update`, [ref.uid])
    const { rows } = await cli.query<{ existe: boolean }>(
      `select exists (
         select 1 from public.creditos_lancamentos
          where tipo = 'consumo' and ref_tipo = $1 and ref_id = $2
       ) as existe`,
      [ref.refTipo, ref.refId],
    )
    if (rows[0]?.existe) return // já consumido para esta unidade: idempotente
    await cli.query(
      `update public.creditos_carteira
          set reservado = greatest(reservado - 1, 0), consumido = consumido + 1
        where profile_id = $1`,
      [ref.uid],
    )
    await lancar(cli, { uid: ref.uid, tipo: 'consumo', quantidade: 1, refTipo: ref.refTipo, refId: ref.refId })
  })
}

/** Créditos AINDA reservados (não disparados) de um aviso (reserva - consumo - devolucao - hold). */
async function reservaPendente(cli: PoolClient, avisoId: string): Promise<number> {
  const { rows } = await cli.query<{ n: string }>(
    `select coalesce(sum(
              case when l.tipo = 'reserva' then l.quantidade
                   when l.tipo in ('consumo','devolucao','hold') then -l.quantidade
                   else 0 end
            ), 0) as n
       from public.creditos_lancamentos l
      where (l.ref_tipo = 'aviso' and l.ref_id = $1)
         or (l.ref_tipo = 'ocorrencia' and l.ref_id in (
              select id from public.aviso_ocorrencias where aviso_id = $1))`,
    [avisoId],
  )
  return Math.max(0, Number(rows[0]?.n ?? 0))
}

/**
 * DEVOLVE a reserva de um aviso que NÃO foi aceito (convite recusado/expirado sem aceite,
 * H11.5): move reservado -> saldo_livre e lança 'devolucao'. Só o que sobra reservado (sem
 * disparo) volta. Recebe um cliente da transação do chamador (o webhook/sweep já está em
 * transação). No-op se não há reserva pendente.
 */
export async function devolverReservaNaoAceito(cli: PoolClient, avisoId: string): Promise<number> {
  const ref = await donoEref(cli, avisoId, null)
  if (!ref) return 0
  const pend = await reservaPendente(cli, avisoId)
  if (pend <= 0) return 0
  await cli.query(`select 1 from public.creditos_carteira where profile_id = $1 for update`, [ref.uid])
  await cli.query(
    `update public.creditos_carteira
        set reservado = greatest(reservado - $2, 0), saldo_livre = saldo_livre + $2
      where profile_id = $1`,
    [ref.uid, pend],
  )
  await lancar(cli, { uid: ref.uid, tipo: 'devolucao', quantidade: pend, refTipo: 'aviso', refId: avisoId })
  return pend
}

/**
 * REATIVA o hold de um aviso (desregistrado -> programado dentro de 24h, H11.6): move
 * em_hold -> reservado e marca os holds não resolvidos do aviso como 'reativado'. Cancela a
 * devolução pendente (o job não devolve o que já voltou). Recebe o cliente da transação do
 * chamador. No-op se não havia hold pendente.
 */
export async function reativarHold(cli: PoolClient, avisoId: string): Promise<number> {
  const { rows } = await cli.query<{ profile_id: string; total: string }>(
    `select profile_id, coalesce(sum(quantidade), 0)::text as total
       from public.creditos_hold
      where aviso_id = $1 and resolvido_em is null
      group by profile_id`,
    [avisoId],
  )
  const linha = rows[0]
  if (!linha) return 0
  const total = Number(linha.total)
  if (total <= 0) return 0
  await cli.query(`select 1 from public.creditos_carteira where profile_id = $1 for update`, [linha.profile_id])
  await cli.query(
    `update public.creditos_carteira
        set em_hold = greatest(em_hold - $2, 0), reservado = reservado + $2
      where profile_id = $1`,
    [linha.profile_id, total],
  )
  await cli.query(
    `update public.creditos_hold
        set resolvido_em = now(), resolucao = 'reativado'
      where aviso_id = $1 and resolvido_em is null`,
    [avisoId],
  )
  return total
}

/**
 * JOB do hold de 24h (H11.6): varre os holds VENCIDOS ainda não resolvidos, devolve
 * em_hold -> saldo_livre, marca resolucao 'devolvido' e lança 'devolucao'. Idempotente
 * (claim FOR UPDATE SKIP LOCKED; só devolve o que ainda não foi resolvido). Roda no
 * scheduler do zap. Retorna quantos holds foram devolvidos.
 */
export async function processarHoldsVencidos(pool: Pool): Promise<number> {
  return comTransacao(pool, async (cli) => {
    const { rows } = await cli.query<{ id: string; profile_id: string; quantidade: number; aviso_id: string | null }>(
      `select id, profile_id, quantidade, aviso_id
         from public.creditos_hold
        where resolvido_em is null and vence_em <= now()
        for update skip locked`,
    )
    for (const h of rows) {
      await cli.query(`select 1 from public.creditos_carteira where profile_id = $1 for update`, [h.profile_id])
      await cli.query(
        `update public.creditos_carteira
            set em_hold = greatest(em_hold - $2, 0), saldo_livre = saldo_livre + $2
          where profile_id = $1`,
        [h.profile_id, h.quantidade],
      )
      await cli.query(
        `update public.creditos_hold set resolvido_em = now(), resolucao = 'devolvido' where id = $1`,
        [h.id],
      )
      await lancar(cli, {
        uid: h.profile_id,
        tipo: 'devolucao',
        quantidade: h.quantidade,
        refTipo: h.aviso_id ? 'aviso' : null,
        refId: h.aviso_id,
      })
    }
    return rows.length
  })
}
