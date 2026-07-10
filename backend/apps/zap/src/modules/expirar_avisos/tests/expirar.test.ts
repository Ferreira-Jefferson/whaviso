import { afterAll, describe, expect, it, vi } from 'vitest'
import { expirarAvisos } from '../index'
import {
  criarAvisoPendente,
  criarEnvioAgendado,
  encerrarPools,
  lerEnvio,
  limpar,
  poolSuper,
} from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

afterAll(async () => {
  await encerrarPools()
})

describe('expirar_avisos (integração)', () => {
  it('programado com data_combinada + 2 < hoje → expirado e envios cancelados', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2020-01-01' })
    const envioId = await criarEnvioAgendado(avisoId, 'd_mais_1', new Date('2020-01-02T12:00:00Z'))

    const n = await expirarAvisos({ pool: poolSuper, logger })
    expect(n).toBeGreaterThanOrEqual(1)

    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('expirado')
    expect((await lerEnvio(envioId)).status).toBe('cancelado')

    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='expirado'`, [avisoId])
    expect(ev.rows[0].n).toBe(1)
    await limpar(cobradorId)
  })

  it('programado dentro do prazo NÃO expira', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2026-12-15' })
    await expirarAvisos({ pool: poolSuper, logger })
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [avisoId])
    expect(aviso.rows[0].status).toBe('programado')
    await limpar(cobradorId)
  })

  it('aguardando_aceite com convite vencido (7 dias, E5/H5.7) → expirado', async () => {
    // inserir já em aguardando_aceite (insert não é transição; o trigger só barra UPDATEs inválidos)
    const { randomUUID } = await import('node:crypto')
    const cobradorId = randomUUID()
    await poolSuper.query(`insert into auth.users (id) values ($1)`, [cobradorId])
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.avisos
         (cobrador_id, direcao, status, nome_devedor, telefone_devedor, motivo, valor_centavos,
          data_combinada, pix_chave, convite_expira_em)
       values ($1,'receber','aguardando_aceite','Maria','+5511999998888','mensalidade',9900,
          '2026-12-15','cobrador@pix.com', now() - interval '1 day')
       returning id`,
      [cobradorId],
    )
    await expirarAvisos({ pool: poolSuper, logger })
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [rows[0]!.id])
    expect(aviso.rows[0].status).toBe('expirado')
    await limpar(cobradorId)
  })

  it('aguardando_aceite DENTRO do prazo de 7 dias NÃO expira', async () => {
    const { randomUUID } = await import('node:crypto')
    const cobradorId = randomUUID()
    await poolSuper.query(`insert into auth.users (id) values ($1)`, [cobradorId])
    const { rows } = await poolSuper.query<{ id: string }>(
      `insert into public.avisos
         (cobrador_id, direcao, status, nome_devedor, telefone_devedor, motivo, valor_centavos,
          data_combinada, pix_chave, convite_expira_em)
       values ($1,'receber','aguardando_aceite','Maria','+5511999998888','mensalidade',9900,
          '2026-12-15','cobrador@pix.com', now() + interval '7 days')
       returning id`,
      [cobradorId],
    )
    await expirarAvisos({ pool: poolSuper, logger })
    const aviso = await poolSuper.query(`select status from public.avisos where id=$1`, [rows[0]!.id])
    expect(aviso.rows[0].status).toBe('aguardando_aceite')
    await limpar(cobradorId)
  })
})
