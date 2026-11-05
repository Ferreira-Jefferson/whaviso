import { describe, it, expect } from 'vitest'
import { criarCripto, ErroCifra } from './cripto'
import { criarMetaOnboardingHttp, ErroMeta } from './meta_onboarding'

// MASTER_KEY de teste (min 32 chars), injetada sem env.
const MK = 'master-key-de-teste-numeros-0123456789-ab'
const MK2 = 'outra-master-key-de-teste-numeros-fedcba-9'

describe('cripto AES-256-GCM do token (adaptador do kernel @whaviso/shared/cifra)', () => {
  it('round trip: decifra (string) o que cifrou', () => {
    const c = criarCripto(MK)
    const claro = 'EAAG...token-de-negocio-da-meta'
    const cifrado = c.cifrar(claro)
    expect(Buffer.isBuffer(cifrado)).toBe(true)
    expect(c.decifrar(cifrado)).toBe(claro)
  })

  it('PROVA api->zap: outra instancia com a MESMA MASTER_KEY decifra o token', () => {
    const api = criarCripto(MK)
    const zap = criarCripto(MK)
    const cifrado = api.cifrar('EAAG...token')
    expect(zap.decifrar(cifrado)).toBe('EAAG...token')
  })

  it('o cifrado NAO contem o texto claro (cifrado em repouso)', () => {
    const c = criarCripto(MK)
    const claro = 'TOKEN_SUPER_SECRETO_123'
    const cifrado = c.cifrar(claro)
    expect(cifrado.toString('utf8')).not.toContain(claro)
    expect(cifrado.toString('latin1')).not.toContain(claro)
  })

  it('nonce aleatorio: duas cifragens do mesmo claro diferem', () => {
    const c = criarCripto(MK)
    expect(c.cifrar('igual').equals(c.cifrar('igual'))).toBe(false)
  })

  it('adulteracao (tag invalida) falha ao decifrar', () => {
    const c = criarCripto(MK)
    const cifrado = c.cifrar('intacto')
    const ultimo = cifrado.length - 1
    cifrado[ultimo] = cifrado[ultimo]! ^ 0xff // corrompe o ultimo byte do ciphertext
    expect(() => c.decifrar(cifrado)).toThrow(ErroCifra)
  })

  it('MASTER_KEY errada falha ao decifrar', () => {
    const cifrado = criarCripto(MK).cifrar('segredo')
    expect(() => criarCripto(MK2).decifrar(cifrado)).toThrow(ErroCifra)
  })

  it('cifrado malformado / versao desconhecida falha', () => {
    const c = criarCripto(MK)
    expect(() => c.decifrar(Buffer.from([0x02, 1, 2, 3]))).toThrow(ErroCifra)
    expect(() => c.decifrar(Buffer.alloc(4))).toThrow(ErroCifra)
  })

  it('MASTER_KEY curta e rejeitada', () => {
    expect(() => criarCripto('curta')).toThrow(ErroCifra)
  })
})

describe('porta Meta: host allowlist e sem redirect (SEC-070)', () => {
  it('sempre chama graph.facebook.com com redirect:error', async () => {
    let urlVista: URL | string | undefined
    let opcoesVistas: RequestInit | undefined
    const fetchFn = (async (url: URL | string, opc?: RequestInit) => {
      urlVista = url
      opcoesVistas = opc
      return new Response(JSON.stringify({ access_token: 't' }), { status: 200 })
    }) as typeof fetch
    const porta = criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', fetchFn })
    await porta.trocarCodigo('codigo-es')
    expect(new URL(String(urlVista)).host).toBe('graph.facebook.com')
    expect(opcoesVistas?.redirect).toBe('error')
  })

  it('redirect barrado (fetch lanca) vira ErroMeta, sem seguir p/ rede interna', async () => {
    // `redirect:'error'` faz o fetch real lancar; simulamos o mesmo comportamento.
    const fetchFn = (async () => {
      throw new TypeError('redirect to http://169.254.169.254 blocked')
    }) as typeof fetch
    const porta = criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', fetchFn })
    await expect(porta.trocarCodigo('x')).rejects.toBeInstanceOf(ErroMeta)
  })

  it('resposta de erro (5xx) da Meta vira ErroMeta', async () => {
    const fetchFn = (async () => new Response('erro', { status: 500 })) as typeof fetch
    const porta = criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', fetchFn })
    await expect(porta.trocarCodigo('x')).rejects.toBeInstanceOf(ErroMeta)
  })

  it('token ausente na resposta vira ErroMeta', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch
    const porta = criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', fetchFn })
    await expect(porta.trocarCodigo('x')).rejects.toBeInstanceOf(ErroMeta)
  })
})

describe('porta Meta: versao do Graph configuravel (e validada)', () => {
  /** fetch que so captura a URL e responde um token valido. */
  function fetchCapturaUrl(): { fetchFn: typeof fetch; urls: Array<URL | string> } {
    const urls: Array<URL | string> = []
    const fetchFn = (async (url: URL | string) => {
      urls.push(url)
      return new Response(JSON.stringify({ access_token: 't' }), { status: 200 })
    }) as typeof fetch
    return { fetchFn, urls }
  }

  it('a versao das opcoes entra no PATH da URL', async () => {
    const { fetchFn, urls } = fetchCapturaUrl()
    const porta = criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', versao: 'v42.7', fetchFn })
    await porta.trocarCodigo('c')
    expect(new URL(String(urls[0])).pathname).toContain('/v42.7/')
  })

  it('sem versao, usa o DEFAULT v23.0', async () => {
    const { fetchFn, urls } = fetchCapturaUrl()
    const porta = criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', fetchFn })
    await porta.trocarCodigo('c')
    expect(new URL(String(urls[0])).pathname).toContain('/v23.0/')
  })

  it('versao fora do formato e rejeitada na construcao (sem injecao de path)', () => {
    expect(() => criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', versao: '../evil' })).toThrow(ErroMeta)
    expect(() => criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', versao: 'v1' })).toThrow(ErroMeta)
  })
})

describe('porta Meta: passo register (opcional, gated por PIN)', () => {
  it('sem PIN: registrarNumero fica AUSENTE (passo pulado)', () => {
    const porta = criarMetaOnboardingHttp({ appId: 'a', appSecret: 's' })
    expect(porta.registrarNumero).toBeUndefined()
  })

  it('PIN fora do formato (6 digitos) e rejeitado na construcao', () => {
    expect(() => criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', registerPin: '12' })).toThrow(ErroMeta)
    expect(() => criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', registerPin: 'abcdef' })).toThrow(ErroMeta)
  })

  it('com PIN valido: POST /<phone>/register no host fixo, body e Bearer corretos (SEC-070)', async () => {
    let urlVista: URL | string | undefined
    let opc: RequestInit | undefined
    const fetchFn = (async (url: URL | string, o?: RequestInit) => {
      urlVista = url
      opc = o
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    const porta = criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', registerPin: '123456', fetchFn })
    expect(porta.registrarNumero).toBeDefined()
    await porta.registrarNumero!('TOKEN_X', 'PN1')
    const u = new URL(String(urlVista))
    expect(u.host).toBe('graph.facebook.com')
    expect(u.pathname).toContain('/PN1/register')
    expect(opc?.method).toBe('POST')
    expect(opc?.redirect).toBe('error')
    expect((opc?.headers as Record<string, string>).authorization).toBe('Bearer TOKEN_X')
    expect(JSON.parse(String(opc?.body))).toEqual({ messaging_product: 'whatsapp', pin: '123456' })
  })

  it('register com 4xx vira ErroMeta (o service e quem engole; aqui a porta so sinaliza)', async () => {
    const fetchFn = (async () => new Response('bad', { status: 400 })) as typeof fetch
    const porta = criarMetaOnboardingHttp({ appId: 'a', appSecret: 's', registerPin: '123456', fetchFn })
    await expect(porta.registrarNumero!('t', 'PN')).rejects.toBeInstanceOf(ErroMeta)
  })
})
