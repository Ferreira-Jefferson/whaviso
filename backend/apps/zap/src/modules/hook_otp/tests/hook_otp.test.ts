import { createHmac, randomUUID } from 'node:crypto'
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
  it('entrega o OTP por WhatsApp quando a assinatura confere', async () => {
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
    expect(whats.textos).toHaveLength(1)
    expect(whats.textos[0]!.para).toBe('5511999998888')
    expect(whats.textos[0]!.texto).toContain('654321')
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
    expect(whats.textos).toHaveLength(0)
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

  it('copy de LOGIN quando o número já tem cadastro (H1.2)', async () => {
    const { app, whats } = await montar()
    const uid = randomUUID()
    const tel = '+5511970445566'
    await poolSuper.query(`insert into auth.users (id) values ($1)`, [uid])
    await poolSuper.query(`update public.profiles set telefone = $2 where id = $1`, [uid, tel])
    try {
      const corpo = JSON.stringify({ user: { phone: tel }, sms: { otp: '202020' } })
      const id = 'msg_login'
      const ts = '1718600010'
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
      expect(whats.textos[0]!.texto).toContain('login')
      expect(whats.textos[0]!.texto).toContain('202020')
    } finally {
      await poolSuper.query(`delete from auth.users where id = $1`, [uid])
      await app.close()
    }
  })

  it('copy de CADASTRO quando o número é novo (H1.3)', async () => {
    const { app, whats } = await montar()
    const corpo = JSON.stringify({ user: { phone: '+5511970990011' }, sms: { otp: '303030' } })
    const id = 'msg_cadastro'
    const ts = '1718600011'
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
    expect(whats.textos[0]!.texto).toContain('cadastro')
    expect(whats.textos[0]!.texto).toContain('303030')
    // No cadastro a copy pede para salvar o contato (número próprio via Baileys).
    expect(whats.textos[0]!.texto).toContain('Salve este contato')
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
