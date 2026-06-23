import { afterAll, describe, expect, it, vi } from 'vitest'
import { ErroEnvio } from '../../../shared/baileys_client'
import { processarEnviosDevidos } from '../index'
import {
  clienteWhatsFake,
  criarAvisoPendente,
  criarEnvioAgendado,
  encerrarPools,
  lerEnvio,
  limpar,
  poolZap,
} from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never
const futuro = '2026-12-15' // data combinada distante → janela aberta

afterAll(async () => {
  await encerrarPools()
})

describe('enviar_lembretes (integração)', () => {
  it('envia com sucesso e grava wamid', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    const envioId = await criarEnvioAgendado(avisoId, 'd')
    const whats = clienteWhatsFake(() => ({ wamid: 'wamid_ok_1' }))

    const n = await processarEnviosDevidos({ pool: poolZap, logger, whats })
    expect(n).toBe(1)
    const e = await lerEnvio(envioId)
    expect(e.status).toBe('enviado')
    expect(e.wamid).toBe('wamid_ok_1')
    await limpar(cobradorId)
  })

  it('falha transitória reagenda com backoff (status volta a agendado, tentativas++)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    const envioId = await criarEnvioAgendado(avisoId, 'd')
    const whats = clienteWhatsFake(() => {
      throw new ErroEnvio(0, 'timeout de rede', false) // transitório
    })

    const n = await processarEnviosDevidos({ pool: poolZap, logger, whats })
    expect(n).toBe(0)
    const e = await lerEnvio(envioId)
    expect(e.status).toBe('agendado')
    expect(e.tentativas).toBe(1)
    expect(e.proxima_tentativa_em).not.toBeNull()
    await limpar(cobradorId)
  })

  it('erro permanente da Meta marca falhou direto', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    const envioId = await criarEnvioAgendado(avisoId, 'd')
    const whats = clienteWhatsFake(() => {
      throw new ErroEnvio(131026, 'destinatário inválido', true) // permanente
    })

    await processarEnviosDevidos({ pool: poolZap, logger, whats })
    const e = await lerEnvio(envioId)
    expect(e.status).toBe('falhou')
    expect(e.erro).toContain('131026')
    await limpar(cobradorId)
  })

  it('janela perdida (data no passado) cancela sem enviar', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: '2020-01-10' })
    const envioId = await criarEnvioAgendado(avisoId, 'd')
    let chamou = false
    const whats = clienteWhatsFake(() => {
      chamou = true
      return { wamid: 'nao_deveria' }
    })

    await processarEnviosDevidos({ pool: poolZap, logger, whats })
    const e = await lerEnvio(envioId)
    expect(e.status).toBe('cancelado')
    expect(e.erro).toBe('janela_perdida')
    expect(chamou).toBe(false)
    await limpar(cobradorId)
  })

  it('informado_pago (H6.5): etapa NÃO-d+1 é cancelada no disparo (ciclo normal parou)', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    const envioId = await criarEnvioAgendado(avisoId, 'd')
    const { poolSuper } = await import('../../../../test/harness')
    // devedor informou pagamento; o ciclo normal PARA (só o empurrãozinho de D+1 sai).
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    let chamou = false
    const whats = clienteWhatsFake(() => {
      chamou = true
      return { wamid: 'nao_deveria' }
    })

    const n = await processarEnviosDevidos({ pool: poolZap, logger, whats })
    expect(n).toBe(0)
    const e = await lerEnvio(envioId)
    expect(e.status).toBe('cancelado')
    expect(e.erro).toBe('informado_pago')
    expect(chamou).toBe(false)
    await limpar(cobradorId)
  })

  it('informado_pago (H6.5): empurrãozinho de D+1 (etapa d_mais_1) SAI, com a variante revisao', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    const envioId = await criarEnvioAgendado(avisoId, 'd_mais_1')
    const { poolSuper } = await import('../../../../test/harness')
    await poolSuper.query(`update public.avisos set status='informado_pago' where id=$1`, [avisoId])
    const whats = clienteWhatsFake(() => ({ wamid: 'wamid_empurrao' }))

    const n = await processarEnviosDevidos({ pool: poolZap, logger, whats })
    expect(n).toBe(1)
    const e = await lerEnvio(envioId)
    expect(e.status).toBe('enviado')
    expect(e.wamid).toBe('wamid_empurrao')
    // Empurrãozinho menciona "ainda não confirmou" (texto do template revisao d_mais_1).
    expect(whats.enviadas[0]!.texto.toLowerCase()).toContain('ainda não confirmou')
    // Os três botões aparecem (H6.2).
    expect(whats.enviadas[0]!.botoes).toHaveLength(3)
    await limpar(cobradorId)
  })

  it('aviso já pago: trigger cancela o envio antes do envio acontecer', async () => {
    const { cobradorId, avisoId } = await criarAvisoPendente({ dataCombinada: futuro })
    const envioId = await criarEnvioAgendado(avisoId, 'd')
    // levar a programado->pago via superusuário dispara o trigger de encerramento.
    const whats = clienteWhatsFake(() => ({ wamid: 'x' }))
    const { poolSuper } = await import('../../../../test/harness')
    await poolSuper.query(`update public.avisos set status='pago' where id=$1`, [avisoId])

    await processarEnviosDevidos({ pool: poolZap, logger, whats })
    const e = await lerEnvio(envioId)
    expect(e.status).toBe('cancelado') // trigger encerrou; reivindicar nem pega
    await limpar(cobradorId)
  })
})
