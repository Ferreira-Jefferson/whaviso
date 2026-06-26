// E11 (zap): ciclo de vida do crédito no disparo. O lembrete que SAI consome 1 crédito
// (reservado -> consumido), de forma IDEMPOTENTE por unidade (as 4 etapas de uma mesma
// ocorrência consomem 1 só vez). O job de hold de 24h devolve em_hold -> saldo_livre.
import { afterAll, describe, expect, it, vi } from 'vitest'
import { processarEnviosDevidos } from '../index'
import { processarHoldsVencidos } from '../../../shared/creditos'
import {
  clienteWhatsFake,
  creditarConta,
  criarAvisoPendente,
  criarEnvioAgendado,
  encerrarPools,
  limpar,
  poolSuper,
  poolZap,
} from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const futuro = '2026-12-15'

afterAll(async () => {
  await encerrarPools()
})

/** Lê os baldes da carteira de uma conta. */
async function carteira(uid: string) {
  const { rows } = await poolSuper.query<{ saldo_livre: number; reservado: number; em_hold: number; consumido: number }>(
    `select saldo_livre, reservado, em_hold, consumido from public.creditos_carteira where profile_id = $1`,
    [uid],
  )
  return rows[0]!
}

/** Simula uma reserva (o que a api faz na ativação): saldo_livre -> reservado + lançamento. */
async function reservar(uid: string, avisoId: string, n: number) {
  await poolSuper.query(
    `update public.creditos_carteira set saldo_livre = saldo_livre - $2, reservado = reservado + $2 where profile_id = $1`,
    [uid, n],
  )
  await poolSuper.query(
    `insert into public.creditos_lancamentos (profile_id, tipo, quantidade, ref_tipo, ref_id)
     values ($1, 'reserva', $2, 'aviso', $3)`,
    [uid, n, avisoId],
  )
}

describe('E11: consumo de crédito no disparo (zap)', () => {
  it('lembrete que sai consome 1 crédito (reservado -> consumido)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    await creditarConta(cobradorId, 10)
    await reservar(cobradorId, avisoId, 1) // simula a reserva da ativação (combinado simples)
    const envioId = await criarEnvioAgendado(avisoId, 'd')
    void envioId

    const whats = clienteWhatsFake(() => ({ wamid: 'w_disparo' }))
    const n = await processarEnviosDevidos({ pool: poolZap, logger, whats })
    expect(n).toBe(1)

    const c = await carteira(cobradorId)
    expect(c.reservado).toBe(0) // a reserva foi consumida
    expect(c.consumido).toBe(1) // consumido permanente
    await limpar(cobradorId)
  })

  it('idempotente: duas etapas da MESMA ocorrência consomem 1 só vez', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    await creditarConta(cobradorId, 10)
    await reservar(cobradorId, avisoId, 1)
    // Duas etapas do MESMO aviso simples (ocorrencia_id null): consome 1 só vez no total.
    await criarEnvioAgendado(avisoId, 'd_menos_2')
    await criarEnvioAgendado(avisoId, 'd_menos_1')

    const whats = clienteWhatsFake(() => ({ wamid: 'w_idem' }))
    // O claim espaça por devedor (10 min); processa em duas passadas para sair as duas etapas.
    await processarEnviosDevidos({ pool: poolZap, logger, whats })
    // Libera o espaçamento de 10 min movendo o enviado para o passado.
    await poolSuper.query(`update public.envios set enviado_em = now() - interval '20 minutes' where aviso_id = $1 and status = 'enviado'`, [avisoId])
    await processarEnviosDevidos({ pool: poolZap, logger, whats })

    const c = await carteira(cobradorId)
    expect(c.consumido).toBe(1) // 1 só consumo, mesmo com 2 etapas enviadas
    await limpar(cobradorId)
  })
})

describe('E11: job de hold de 24h (zap)', () => {
  it('devolve em_hold -> saldo_livre quando o hold vence; idempotente', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    await creditarConta(cobradorId, 10)
    // Simula um hold vencido (em_hold) deste aviso.
    await poolSuper.query(
      `update public.creditos_carteira set saldo_livre = saldo_livre - 3, em_hold = em_hold + 3 where profile_id = $1`,
      [cobradorId],
    )
    await poolSuper.query(
      `insert into public.creditos_hold (profile_id, aviso_id, quantidade, vence_em)
       values ($1, $2, 3, now() - interval '1 minute')`,
      [cobradorId, avisoId],
    )
    const antes = await carteira(cobradorId)
    expect(antes.em_hold).toBe(3)

    const devolvidos = await processarHoldsVencidos(poolZap)
    expect(devolvidos).toBe(1)
    const depois = await carteira(cobradorId)
    expect(depois.em_hold).toBe(0)
    expect(depois.saldo_livre).toBe(antes.saldo_livre + 3)

    // Idempotente: rodar de novo não devolve nada (hold já resolvido).
    const dezadois = await processarHoldsVencidos(poolZap)
    expect(dezadois).toBe(0)
    const final = await carteira(cobradorId)
    expect(final.saldo_livre).toBe(depois.saldo_livre)
    await limpar(cobradorId)
  })

  it('não toca holds ainda no prazo (vence_em futuro)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    await creditarConta(cobradorId, 10)
    await poolSuper.query(
      `update public.creditos_carteira set saldo_livre = saldo_livre - 2, em_hold = em_hold + 2 where profile_id = $1`,
      [cobradorId],
    )
    await poolSuper.query(
      `insert into public.creditos_hold (profile_id, aviso_id, quantidade, vence_em)
       values ($1, $2, 2, now() + interval '24 hours')`,
      [cobradorId, avisoId],
    )
    const devolvidos = await processarHoldsVencidos(poolZap)
    expect(devolvidos).toBe(0)
    const c = await carteira(cobradorId)
    expect(c.em_hold).toBe(2) // segue em hold
    await limpar(cobradorId)
  })
})
