// E6 H6.10 / E8 H8.7 (zap): aceite de combinado RECORRENTE gera o mini-ciclo da
// ocorrência corrente (com ocorrencia_id) ancorado na data dela; confirmar por botão no
// WhatsApp avança a ocorrência (k<N: volta a programado, NÃO vira pago) e fecha no fim.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { sha256ConviteHex } from '@whaviso/shared/contracts'
import { processarBotao } from '../service'
import { clienteWhatsFake, encerrarPools, limpar, poolSuper } from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const TEL = '+5511955554444'

let usados: string[] = []
afterEach(async () => {
  if (usados.length > 0) {
    const { rows } = await poolSuper.query<{ id: string }>(
      `select id from public.avisos where cobrador_id = any($1) or devedor_profile_id = any($1)`, [usados])
    const ids = rows.map((r) => r.id)
    if (ids.length > 0) {
      await poolSuper.query(`delete from public.notificacoes_cobrador where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.envios where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.eventos_aviso where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.aviso_ocorrencias where aviso_id = any($1)`, [ids])
      await poolSuper.query(`delete from public.avisos where id = any($1)`, [ids])
    }
  }
  for (const id of usados) await limpar(id).catch(() => undefined)
  usados = []
})
afterAll(async () => {
  await encerrarPools()
})

/** Convite recorrente (aguardando_aceite) + N ocorrências materializadas (índice 1..N). */
async function criarConviteRecorrente(numeroOcorrencias: number): Promise<{ cobradorId: string; avisoId: string }> {
  const cobradorId = randomUUID()
  usados.push(cobradorId)
  await poolSuper.query(`insert into auth.users (id) values ($1)`, [cobradorId])
  await poolSuper.query(`update public.profiles set nome='Cobrador', telefone=$2 where id=$1`, [cobradorId, '+5511960009999'])
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
        motivo, valor_centavos, data_combinada, pix_chave, convite_hash, convite_expira_em,
        recorrencia_tipo, recorrencia_freq, recorrencia_intervalo, ocorrencias_total, ocorrencia_atual)
     values ($1,'receber','cobrador','aguardando_aceite','Maria',$2,'mensalidade',9900,
             '2026-12-10','cobrador@pix.com',$3, now() + interval '7 days',
             'periodo','mensal',1,$4,1)
     returning id`,
    [cobradorId, TEL, sha256ConviteHex('123456'), numeroOcorrencias],
  )
  const avisoId = rows[0]!.id
  // Materializa as N ocorrências (datas mensais a partir de 2026-12-10).
  for (let i = 0; i < numeroOcorrencias; i++) {
    await poolSuper.query(
      `insert into public.aviso_ocorrencias (aviso_id, indice, data_combinada, status)
       values ($1,$2, (date '2026-12-10' + ($2 - 1) * interval '1 month')::date, 'programado')`,
      [avisoId, i + 1],
    )
  }
  return { cobradorId, avisoId }
}

async function statusDe(id: string): Promise<string> {
  const { rows } = await poolSuper.query<{ status: string }>(`select status from public.avisos where id=$1`, [id])
  return rows[0]!.status
}
async function ponteiro(id: string): Promise<number> {
  const { rows } = await poolSuper.query<{ a: number }>(`select ocorrencia_atual as a from public.avisos where id=$1`, [id])
  return rows[0]!.a
}

describe('E6/E8 zap: aceite + confirmação por ocorrência (recorrente)', () => {
  it('aceite recorrente gera o mini-ciclo da ocorrência 1 com ocorrencia_id (não envios soltos)', async () => {
    const { avisoId } = await criarConviteRecorrente(3)
    const whats = clienteWhatsFake()
    await processarBotao({ pool: poolSuper, logger, whats }, { wamid: 'w', telefone: TEL, buttonId: `aceite:${avisoId}` })

    expect(await statusDe(avisoId)).toBe('programado')
    // Envios criados, TODOS com ocorrencia_id = ocorrência 1 (nenhum simples/null).
    const oc1 = await poolSuper.query<{ id: string }>(
      `select id from public.aviso_ocorrencias where aviso_id=$1 and indice=1`, [avisoId])
    const envios = await poolSuper.query<{ total: string; comOc: string }>(
      `select count(*) as total, count(*) filter (where ocorrencia_id=$2) as "comOc"
         from public.envios where aviso_id=$1`, [avisoId, oc1.rows[0]!.id])
    expect(Number(envios.rows[0]!.total)).toBeGreaterThan(0)
    expect(envios.rows[0]!.total).toBe(envios.rows[0]!.comOc) // todos com ocorrencia_id
    const semOc = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.envios where aviso_id=$1 and ocorrencia_id is null`, [avisoId])
    expect(Number(semOc.rows[0]!.n)).toBe(0)
  })

  it('confirmar por botão a ocorrência 1 de 2: avança ponteiro, NÃO vira pago; confirmar a última vira pago', async () => {
    const { cobradorId, avisoId } = await criarConviteRecorrente(2)
    // Aceite (gera ciclo da ocorrência 1) + telefone do cobrador no profile p/ rotear o botão.
    await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [cobradorId, '+5511960009999'])
    const whats = clienteWhatsFake()
    const deps = { pool: poolSuper, logger, whats }
    await processarBotao(deps, { wamid: 'w0', telefone: TEL, buttonId: `aceite:${avisoId}` })
    // Devedor informa pago da ocorrência 1 (programado -> informado_pago) para habilitar confirmar.
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])

    // Cobrador confirma por botão (roteado pelo telefone do profile): ocorrência 1 fecha, avança.
    await processarBotao(deps, { wamid: 'w1', telefone: '+5511960009999', buttonId: `confirmar:${avisoId}` })
    expect(await statusDe(avisoId)).toBe('programado') // NÃO vira pago (intermediária)
    expect(await ponteiro(avisoId)).toBe(2)
    // Mensagem ao devedor é a variante recorrente.
    const rec = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.notificacoes_cobrador where aviso_id=$1 and tipo='encerramento_recorrente'`, [avisoId])
    expect(Number(rec.rows[0]!.n)).toBe(1)

    // Ocorrência 2 (última): informa + confirma -> pago terminal.
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    await processarBotao(deps, { wamid: 'w2', telefone: '+5511960009999', buttonId: `confirmar:${avisoId}` })
    expect(await statusDe(avisoId)).toBe('pago')
  })
})
