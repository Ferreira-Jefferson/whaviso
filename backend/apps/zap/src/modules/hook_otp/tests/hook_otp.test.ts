import { createHmac } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeClienteWhats } from '@whaviso/shared/clientes'
import type { Pool } from '@whaviso/shared/db'
import { assinaturaValida, registrarHookOtp, type DepsHookOtp } from '../index'

// Segredo no formato do Supabase: whsec_<base64 da chave>.
const CHAVE = Buffer.from('chave_secreta_do_hook_de_teste')
const SECRET = 'whsec_' + CHAVE.toString('base64')

/** Pool minimo que registra os `tipo` auditados em eventos_auth (sem banco real). */
function poolFake(): { pool: Pool; tipos: string[] } {
  const tipos: string[] = []
  const pool = {
    query: async (_texto: string, valores: unknown[]) => {
      tipos.push(String((valores as unknown[])[0]))
      return { rows: [], rowCount: 1 }
    },
  } as unknown as Pool
  return { pool, tipos }
}

/** App minimo com o parser de rawBody (igual ao app.ts) e o hook registrado. */
function montar(over: Partial<DepsHookOtp> = {}): {
  app: FastifyInstance
  whats: FakeClienteWhats
  tipos: string[]
} {
  const app = Fastify()
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, corpo, done) => {
    ;(req as { rawBody?: Buffer }).rawBody = corpo as Buffer
    if ((corpo as Buffer).length === 0) return done(null, undefined)
    try {
      done(null, JSON.parse((corpo as Buffer).toString('utf8')))
    } catch (erro) {
      done(erro as Error)
    }
  })
  const whats = new FakeClienteWhats()
  const { pool, tipos } = poolFake()
  registrarHookOtp(app, {
    pool,
    whats,
    hookSecret: SECRET,
    phoneNumberId: '100200300',
    accessToken: 'token-plataforma',
    templateOtp: 'whaviso_otp',
    idiomaOtp: 'pt_BR',
    ...over,
  })
  return { app, whats, tipos }
}

/** Assina como o Standard Webhooks: base64(HMAC(`id.ts.corpo`)). */
function assinar(id: string, ts: string, corpo: string): string {
  return 'v1,' + createHmac('sha256', CHAVE).update(`${id}.${ts}.${corpo}`).digest('base64')
}

/** Timestamp Unix (s) atual, como string (frescor anti-replay +-5 min). */
function tsAgora(): string {
  return Math.floor(Date.now() / 1000).toString()
}

/** Deixa o envio/auditoria de background (apos o 200) completar. */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

let appAtual: FastifyInstance | undefined
afterEach(async () => {
  await appAtual?.close()
  appAtual = undefined
})

describe('hook_otp: assinaturaValida', () => {
  it('aceita assinatura correta e rejeita corpo adulterado / headers faltando', () => {
    const id = 'msg_1'
    const ts = tsAgora()
    const corpo = '{"sms":{"otp":"123456"}}'
    const cab = { id, timestamp: ts, assinatura: assinar(id, ts, corpo) }
    expect(assinaturaValida(Buffer.from(corpo), cab, SECRET)).toBe(true)
    expect(assinaturaValida(Buffer.from(corpo + 'x'), cab, SECRET)).toBe(false)
    expect(assinaturaValida(Buffer.from(corpo), { ...cab, id: undefined }, SECRET)).toBe(false)
  })

  it('rejeita timestamp fora da janela de frescor (anti-replay)', () => {
    const id = 'msg_velho'
    const corpo = '{"sms":{"otp":"123456"}}'
    const tsVelho = (Math.floor(Date.now() / 1000) - 600).toString()
    const cab = { id, timestamp: tsVelho, assinatura: assinar(id, tsVelho, corpo) }
    expect(assinaturaValida(Buffer.from(corpo), cab, SECRET)).toBe(false)
  })
})

describe('hook_otp: POST /hooks/send-code', () => {
  it('entrega o OTP pelo template AUTHENTICATION quando a assinatura confere', async () => {
    const { app, whats, tipos } = montar()
    appAtual = app
    const corpo = JSON.stringify({ user: { phone: '+5511999998888' }, sms: { otp: '654321' } })
    const id = 'msg_ok'
    const ts = tsAgora()
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
    await flush()
    expect(whats.chamadas).toHaveLength(1)
    const c = whats.chamadas[0]!
    expect(c.operacao).toBe('enviarTemplateAutenticacao')
    const entrada = c.entrada as { para: string; nome: string; codigo: string }
    expect(entrada.para).toBe('+5511999998888')
    expect(entrada.nome).toBe('whaviso_otp')
    expect(entrada.codigo).toBe('654321')
    // Auditoria: solicitado + entregue, telefone so como hash (nunca o codigo).
    expect(tipos).toContain('otp_solicitado')
    expect(tipos).toContain('otp_entregue')
  })

  it('normaliza o telefone so-digitos do Supabase para E.164 com +', async () => {
    const { app, whats } = montar()
    appAtual = app
    const corpo = JSON.stringify({ user: { phone: '5511988887777' }, sms: { otp: '111222' } })
    const id = 'msg_digitos'
    const ts = tsAgora()
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
    await flush()
    const entrada = whats.chamadas[0]!.entrada as { para: string }
    expect(entrada.para).toBe('+5511988887777')
  })

  it('rejeita assinatura invalida com 401 (nao envia)', async () => {
    const { app, whats } = montar()
    appAtual = app
    const corpo = JSON.stringify({ user: { phone: '5511999998888' }, sms: { otp: '111111' } })
    const r = await app.inject({
      method: 'POST',
      url: '/hooks/send-code',
      headers: {
        'content-type': 'application/json',
        'webhook-id': 'x',
        'webhook-timestamp': tsAgora(),
        'webhook-signature': 'v1,assinatura_errada',
      },
      payload: corpo,
    })
    expect(r.statusCode).toBe(401)
    expect(whats.chamadas).toHaveLength(0)
  })

  it('sem SEND_CODE_HOOK_SECRET -> 503 (recurso desligado)', async () => {
    const { app } = montar({ hookSecret: undefined })
    appAtual = app
    const r = await app.inject({
      method: 'POST',
      url: '/hooks/send-code',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    })
    expect(r.statusCode).toBe(503)
  })

  it('sem credencial META_* da plataforma -> 503', async () => {
    const { app } = montar({ accessToken: undefined })
    appAtual = app
    const r = await app.inject({
      method: 'POST',
      url: '/hooks/send-code',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    })
    expect(r.statusCode).toBe(503)
  })

  it('payload sem telefone/otp -> 400', async () => {
    const { app } = montar()
    appAtual = app
    const corpo = JSON.stringify({ user: {}, sms: {} })
    const id = 'msg_vazio'
    const ts = tsAgora()
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
  })
})
