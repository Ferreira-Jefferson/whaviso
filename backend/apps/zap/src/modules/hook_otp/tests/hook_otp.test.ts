import { createHmac } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { criarLogger } from '@whaviso/shared/logger'
import { criarApp } from '../../../app'
import { clienteWhatsFake, encerrarPools, envZapFake, poolSuper, type WhatsFake } from '../../../../test/harness'
import { assinaturaValida } from '../verificar_assinatura'

// Segredo no formato do Supabase: whsec_<base64 da chave>.
const CHAVE = Buffer.from('chave_secreta_do_hook_de_teste')
const SECRET = 'whsec_' + CHAVE.toString('base64')

async function montar(comSecret = true): Promise<{ app: Awaited<ReturnType<typeof criarApp>>; whats: WhatsFake }> {
  const env = envZapFake({ SEND_CODE_HOOK_SECRET: comSecret ? SECRET : undefined })
  const whats = clienteWhatsFake()
  const logger = criarLogger('zap-test', 'silent')
  const app = await criarApp({ env, pool: poolSuper, logger, whats })
  return { app, whats }
}

/** Assina como o Standard Webhooks: base64(HMAC(`id.ts.corpo`)). */
function assinar(id: string, ts: string, corpo: string): string {
  return 'v1,' + createHmac('sha256', CHAVE).update(`${id}.${ts}.${corpo}`).digest('base64')
}

afterAll(async () => {
  await encerrarPools()
})

describe('hook_otp: assinaturaValida', () => {
  it('aceita assinatura correta e rejeita corpo adulterado / headers faltando', () => {
    const id = 'msg_1'
    const ts = '1718600000'
    const corpo = '{"sms":{"otp":"123456"}}'
    const sig = assinar(id, ts, corpo)
    const cab = { id, timestamp: ts, assinatura: sig }

    expect(assinaturaValida(Buffer.from(corpo), cab, SECRET)).toBe(true)
    expect(assinaturaValida(Buffer.from(corpo + 'x'), cab, SECRET)).toBe(false)
    expect(assinaturaValida(Buffer.from(corpo), { ...cab, id: undefined }, SECRET)).toBe(false)
  })
})

describe('hook_otp: POST /hooks/send-code (integração)', () => {
  it('entrega o OTP pelo template AUTHENTICATION quando a assinatura confere', async () => {
    const { app, whats } = await montar()
    const corpo = JSON.stringify({ user: { phone: '+5511999998888' }, sms: { otp: '654321' } })
    const id = 'msg_ok'
    const ts = '1718600001'
    const r = await app.inject({
      method: 'POST',
      url: '/hooks/send-code',
      headers: {
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': ts,
        'webhook-signature': assinar(id, ts, corpo),
      },
      payload: corpo,
    })
    expect(r.statusCode).toBe(200)
    expect(whats.enviadas).toHaveLength(1)
    const m = whats.enviadas[0]!
    expect(m.para).toBe('5511999998888')
    // Vai por template de autenticação: o código entra nos parâmetros (corpo + botão).
    expect(m.template?.autenticacao).toBe(true)
    expect(m.template?.parametros).toEqual(['654321'])
    // O texto de fallback (contrato) também carrega o código, nunca logado.
    expect(m.texto).toContain('654321')
    await app.close()
  })

  it('rejeita assinatura inválida com 401 (não envia)', async () => {
    const { app, whats } = await montar()
    const corpo = JSON.stringify({ user: { phone: '5511999998888' }, sms: { otp: '111111' } })
    const r = await app.inject({
      method: 'POST',
      url: '/hooks/send-code',
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'x',
        'webhook-timestamp': '1',
        'webhook-signature': 'v1,assinatura_errada',
      },
      payload: corpo,
    })
    expect(r.statusCode).toBe(401)
    expect(whats.enviadas).toHaveLength(0)
    await app.close()
  })

  it('sem SEND_CODE_HOOK_SECRET → 503 (recurso desligado)', async () => {
    const { app } = await montar(false)
    const r = await app.inject({
      method: 'POST',
      url: '/hooks/send-code',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    })
    expect(r.statusCode).toBe(503)
    await app.close()
  })

  it('payload sem telefone/otp → 400', async () => {
    const { app } = await montar()
    const corpo = JSON.stringify({ user: {}, sms: {} })
    const id = 'msg_vazio'
    const ts = '1718600002'
    const r = await app.inject({
      method: 'POST',
      url: '/hooks/send-code',
      headers: {
        'content-type': 'application/json',
        'webhook-id': id,
        'webhook-timestamp': ts,
        'webhook-signature': assinar(id, ts, corpo),
      },
      payload: corpo,
    })
    expect(r.statusCode).toBe(400)
    await app.close()
  })
})
