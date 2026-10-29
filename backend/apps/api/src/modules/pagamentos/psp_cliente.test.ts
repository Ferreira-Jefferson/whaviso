// Cliente real do Asaas (modelo B), testado SEM rede: injetamos um `fetch` fake e conferimos o
// mapeamento do payload (split da taxa, Pix em 2 passos, cartao por checkout) e a validacao do
// webhook por token fixo. Nenhum segredo real; nenhuma chamada externa.
import { describe, it, expect } from 'vitest'
import type { EnvApiTipado as EnvApi } from '@whaviso/shared/config'
import type { ResolverDns } from '@whaviso/shared/clientes'
import { criarAsaasDoAmbiente, type InjecaoPsp } from './psp_cliente'

const ENV = {
  ASAAS_AMBIENTE: 'sandbox',
  ASAAS_WALLET_ID: 'wlt_whaviso',
  ASAAS_WEBHOOK_TOKEN: 'webhook-token-unit-0123456789abcdef',
} as unknown as EnvApi

// DNS fake resolvendo para um IP publico: o fetchSeguro exige host publico, mas nao ha rede nos testes.
const dnsFake: ResolverDns = async () => ['93.184.216.34']
const inj = (fetchImpl: typeof fetch): InjecaoPsp => ({ fetchImpl, resolverDns: dnsFake })

/** fetch fake: registra as chamadas e responde conforme o caminho (payments -> id; pixQrCode -> payload). */
function fetchFake() {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init })
    if (u.includes('/pixQrCode')) return new Response(JSON.stringify({ payload: 'PIX-COPIA-COLA' }), { status: 200 })
    if (u.endsWith('/payments')) return new Response(JSON.stringify({ id: 'pay_123', invoiceUrl: 'https://asaas/checkout/pay_123' }), { status: 200 })
    return new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
  return { calls, impl }
}

describe('criarAsaasDoAmbiente: gating', () => {
  it('sem ASAAS_AMBIENTE retorna null (caminho intermediado fica 501)', () => {
    expect(criarAsaasDoAmbiente({} as EnvApi)).toBeNull()
  })
  it('ambiente definido sem wallet/token lanca config incompleta', () => {
    expect(() => criarAsaasDoAmbiente({ ASAAS_AMBIENTE: 'sandbox' } as unknown as EnvApi)).toThrow(/ASAAS_WALLET_ID/)
  })
})

describe('criarCobranca (modelo B: subconta cria, split da taxa pro whaviso)', () => {
  it('pix: POST /payments na subconta + split fixo da taxa + GET pixQrCode devolve o copia-e-cola', async () => {
    const { calls, impl } = fetchFake()
    const cli = criarAsaasDoAmbiente(ENV, inj(impl))!
    const r = await cli.criarCobranca(
      { chave: 'subconta-key' },
      { meio: 'pix', valorCobradoCentavos: 6000, encargoWhavisoCentavos: 50, customerRef: 'cus_1', referencia: 'P-ABC' },
    )
    expect(r).toEqual({ chargeRef: 'pay_123', payload: 'PIX-COPIA-COLA' })

    // 1a chamada: cria a cobranca autenticando como a SUBCONTA, com o split da taxa pro whaviso.
    expect(calls[0]!.url).toBe('https://api-sandbox.asaas.com/v3/payments')
    const headers = calls[0]!.init!.headers as Record<string, string>
    expect(headers.access_token).toBe('subconta-key')
    const body = JSON.parse(calls[0]!.init!.body as string)
    expect(body).toMatchObject({
      customer: 'cus_1',
      billingType: 'PIX',
      value: 60,
      externalReference: 'P-ABC',
      split: [{ walletId: 'wlt_whaviso', fixedValue: 0.5 }],
    })
    // 2a chamada: busca o QR/copia-e-cola da cobranca criada.
    expect(calls[1]!.url).toBe('https://api-sandbox.asaas.com/v3/payments/pay_123/pixQrCode')
  })

  it('sem encargo (taxa 0) nao manda split', async () => {
    const { calls, impl } = fetchFake()
    const cli = criarAsaasDoAmbiente(ENV, inj(impl))!
    await cli.criarCobranca(
      { chave: 'k' },
      { meio: 'pix', valorCobradoCentavos: 6000, encargoWhavisoCentavos: 0, customerRef: 'cus_1', referencia: 'P-1' },
    )
    expect(JSON.parse(calls[0]!.init!.body as string).split).toBeUndefined()
  })

  it('cartao: devolve o checkout hospedado (invoiceUrl), sem buscar QR', async () => {
    const { calls, impl } = fetchFake()
    const cli = criarAsaasDoAmbiente(ENV, inj(impl))!
    const r = await cli.criarCobranca(
      { chave: 'k' },
      { meio: 'cartao', valorCobradoCentavos: 6050, encargoWhavisoCentavos: 50, customerRef: 'cus_1', referencia: 'P-2' },
    )
    expect(r).toEqual({ chargeRef: 'pay_123', payload: 'https://asaas/checkout/pay_123' })
    expect(JSON.parse(calls[0]!.init!.body as string).billingType).toBe('CREDIT_CARD')
    expect(calls.some((c) => c.url.includes('/pixQrCode'))).toBe(false)
  })

  it('Asaas rejeita (400) -> erro psp_rejeitou (422)', async () => {
    const impl = (async () => new Response('{"errors":[]}', { status: 400 })) as unknown as typeof fetch
    const cli = criarAsaasDoAmbiente(ENV, inj(impl))!
    await expect(
      cli.criarCobranca({ chave: 'k' }, { meio: 'pix', valorCobradoCentavos: 6000, encargoWhavisoCentavos: 50, customerRef: 'cus_1', referencia: 'P' }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'psp_rejeitou' })
  })
})

describe('interpretarWebhook (token fixo + mapeamento do evento)', () => {
  const cli = criarAsaasDoAmbiente(ENV)!

  it('token ausente ou invalido -> null (rota responde 401)', () => {
    const corpo = JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } })
    expect(cli.interpretarWebhook(undefined, corpo)).toBeNull()
    expect(cli.interpretarWebhook('errado', corpo)).toBeNull()
    expect(cli.interpretarWebhook('webhook-token-unit-0123456789abcdeX', corpo)).toBeNull() // mesmo tamanho, difere
  })

  it('token valido + PAYMENT_RECEIVED -> pago, taxa = value - netValue (centavos)', () => {
    const corpo = JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_9', value: 60.5, netValue: 59.51 } })
    expect(cli.interpretarWebhook(ENV.ASAAS_WEBHOOK_TOKEN, corpo)).toEqual({ chargeRef: 'pay_9', pago: true, taxaPspCentavos: 99 })
  })

  it('token valido + evento irrelevante -> ack sem conciliar (pago: false)', () => {
    const corpo = JSON.stringify({ event: 'PAYMENT_CREATED', payment: { id: 'pay_9' } })
    expect(cli.interpretarWebhook(ENV.ASAAS_WEBHOOK_TOKEN, corpo)).toMatchObject({ pago: false })
  })

  it('token valido + corpo invalido -> ack sem conciliar (nao e 401)', () => {
    expect(cli.interpretarWebhook(ENV.ASAAS_WEBHOOK_TOKEN, 'nao-e-json')).toEqual({ chargeRef: '', pago: false, taxaPspCentavos: null })
  })
})
