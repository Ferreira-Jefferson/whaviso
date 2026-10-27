import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { CredencialResolvida, type NumeroWhats } from '@whaviso/shared/clientes'
import { contratoClienteWhats } from '@whaviso/shared/clientes/testing'
import { criarClienteWhatsMeta } from '../cliente_meta'

// ---- fetch fake: sem rede real; grava as chamadas e devolve respostas programadas ----

interface ChamadaFetch {
  url: string
  metodo: string
  headers: Record<string, string>
  body: string | undefined
}

interface RespPrograma {
  status?: number
  json?: unknown
  bytes?: Uint8Array
  headers?: Record<string, string>
}

function montarResposta(r: RespPrograma): Response {
  const headers = new Headers(r.headers)
  if (r.bytes) return new Response(r.bytes, { status: r.status ?? 200, headers })
  const corpo = r.json === undefined ? null : JSON.stringify(r.json)
  if (corpo !== null && !headers.has('content-type')) headers.set('content-type', 'application/json')
  return new Response(corpo, { status: r.status ?? 200, headers })
}

function criarFetchFake(responder: (c: ChamadaFetch) => RespPrograma): {
  fetchImpl: typeof fetch
  chamadas: ChamadaFetch[]
} {
  const chamadas: ChamadaFetch[] = []
  const fetchImpl = (async (entrada: unknown, init?: RequestInit): Promise<Response> => {
    const url = entrada instanceof URL ? entrada.toString() : String(entrada)
    const headers = (init?.headers ?? {}) as Record<string, string>
    const chamada: ChamadaFetch = {
      url,
      metodo: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : undefined,
    }
    chamadas.push(chamada)
    return montarResposta(responder(chamada))
  }) as typeof fetch
  return { fetchImpl, chamadas }
}

// DNS sempre publico: isola fetchSeguro de qualquer resolucao real.
const resolverDns = async (): Promise<string[]> => ['93.184.216.34']
const APP_SECRET = 'app-secret-de-teste'
const numero = (): NumeroWhats => ({ phoneNumberId: '100200300', credencial: new CredencialResolvida('token-xyz') })
const para = '+5511999998888'

// ---- suite de contrato (@whaviso/shared/clientes/testing) ----

contratoClienteWhats('cliente_meta', () => {
  let seq = 0
  const { fetchImpl } = criarFetchFake((c) => {
    if (c.url.endsWith('/messages')) {
      const corpo = JSON.parse(c.body ?? '{}') as { status?: string }
      if (corpo.status === 'read') return { json: { success: true } }
      seq += 1
      return { json: { messages: [{ id: `wamid.meta.${seq}` }] } }
    }
    if (c.url.includes('lookaside.fbsbx.com')) return { bytes: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'image/jpeg' } }
    // metadados de midia (GET /{media_id})
    return { json: { url: 'https://lookaside.fbsbx.com/m/abc', mime_type: 'image/jpeg' } }
  })
  const cliente = criarClienteWhatsMeta({ appSecret: APP_SECRET, fetchImpl, resolverDns })
  return { cliente, assinar: (c) => `sha256=${createHmac('sha256', APP_SECRET).update(c).digest('hex')}` }
})

// ---- payloads por tipo de envio ----

describe('cliente_meta: payloads', () => {
  function clienteOk() {
    const { fetchImpl, chamadas } = criarFetchFake(() => ({ json: { messages: [{ id: 'wamid.1' }] } }))
    return { cliente: criarClienteWhatsMeta({ appSecret: APP_SECRET, fetchImpl, resolverDns }), chamadas }
  }

  it('texto: type text, destino so com digitos, token no header Authorization', async () => {
    const { cliente, chamadas } = clienteOk()
    const r = await cliente.enviarTexto({ numero: numero(), para, texto: 'oi' })
    expect(r.ok && r.valor.wamid).toBe('wamid.1')
    const c = chamadas[0]!
    expect(c.metodo).toBe('POST')
    expect(c.url).toBe('https://graph.facebook.com/v23.0/100200300/messages')
    const body = JSON.parse(c.body!) as { type: string; to: string; text: { body: string } }
    expect(body.type).toBe('text')
    expect(body.to).toBe('5511999998888')
    expect(body.text.body).toBe('oi')
    expect(c.headers['Authorization']).toBe('Bearer token-xyz')
  })

  it('template: name/language e componentes (body + button quick_reply)', async () => {
    const { cliente, chamadas } = clienteOk()
    await cliente.enviarTemplate({
      numero: numero(),
      para,
      nome: 'lembrete',
      idioma: 'pt_BR',
      componentes: [
        { tipo: 'body', parametros: ['Ana', 'R$ 10'] },
        { tipo: 'button', parametros: ['PAGO'] },
      ],
    })
    const body = JSON.parse(chamadas[0]!.body!) as {
      type: string
      template: { name: string; language: { code: string }; components: Array<Record<string, unknown>> }
    }
    expect(body.type).toBe('template')
    expect(body.template.name).toBe('lembrete')
    expect(body.template.language.code).toBe('pt_BR')
    expect(body.template.components[0]).toMatchObject({ type: 'body' })
    expect(body.template.components[1]).toMatchObject({ type: 'button', sub_type: 'quick_reply', index: 0 })
  })

  it('interativo botoes: type interactive/button com reply id+title', async () => {
    const { cliente, chamadas } = clienteOk()
    await cliente.enviarInterativo({
      numero: numero(),
      para,
      corpo: 'escolha',
      interacao: { tipo: 'botoes', botoes: [{ id: 'sim', titulo: 'Sim' }, { id: 'nao', titulo: 'Nao' }] },
    })
    const body = JSON.parse(chamadas[0]!.body!) as {
      interactive: { type: string; action: { buttons: Array<{ reply: { id: string } }> } }
    }
    expect(body.interactive.type).toBe('button')
    expect(body.interactive.action.buttons.map((b) => b.reply.id)).toEqual(['sim', 'nao'])
  })

  it('interativo lista: type interactive/list com sections e rows', async () => {
    const { cliente, chamadas } = clienteOk()
    await cliente.enviarInterativo({
      numero: numero(),
      para,
      corpo: 'menu',
      interacao: {
        tipo: 'lista',
        rotuloBotao: 'Abrir',
        secoes: [{ titulo: 'Opcoes', linhas: [{ id: 'a', titulo: 'A', descricao: 'desc' }] }],
      },
    })
    const body = JSON.parse(chamadas[0]!.body!) as {
      interactive: { type: string; action: { button: string; sections: Array<{ rows: Array<{ id: string }> }> } }
    }
    expect(body.interactive.type).toBe('list')
    expect(body.interactive.action.button).toBe('Abrir')
    expect(body.interactive.action.sections[0]!.rows[0]!.id).toBe('a')
  })

  it('midia: type image com link e caption (audio nao leva caption)', async () => {
    const { cliente, chamadas } = clienteOk()
    await cliente.enviarMidia({ numero: numero(), para, tipo: 'image', url: 'https://x.test/i.jpg', legenda: 'ola' })
    const body = JSON.parse(chamadas[0]!.body!) as { type: string; image: { link: string; caption?: string } }
    expect(body.type).toBe('image')
    expect(body.image).toMatchObject({ link: 'https://x.test/i.jpg', caption: 'ola' })
  })

  it('entrada invalida vira erro local (sem round-trip): > 3 botoes', async () => {
    const { cliente, chamadas } = clienteOk()
    const r = await cliente.enviarInterativo({
      numero: numero(),
      para,
      corpo: 'x',
      interacao: {
        tipo: 'botoes',
        botoes: [
          { id: 'a', titulo: 'A' },
          { id: 'b', titulo: 'B' },
          { id: 'c', titulo: 'C' },
          { id: 'd', titulo: 'D' },
        ],
      },
    })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erro.codigo).toBe('entrada_invalida')
    expect(chamadas.length).toBe(0)
  })
})

// ---- mapeamento de erros da Meta ----

describe('cliente_meta: mapeamento de erros', () => {
  async function enviarCom(resp: RespPrograma) {
    const { fetchImpl } = criarFetchFake(() => resp)
    const cliente = criarClienteWhatsMeta({ appSecret: APP_SECRET, fetchImpl, resolverDns })
    return cliente.enviarTexto({ numero: numero(), para, texto: 'oi' })
  }

  it('131047 -> JanelaExpirada (nao retentavel)', async () => {
    const r = await enviarCom({ json: { error: { code: 131047 } } })
    expect(!r.ok && r.erro.tipo).toBe('JanelaExpirada')
    expect(!r.ok && r.erro.retentavel).toBe(false)
  })
  it('132015 -> TemplateNaoAprovado', async () => {
    const r = await enviarCom({ json: { error: { code: 132015 } } })
    expect(!r.ok && r.erro.tipo).toBe('TemplateNaoAprovado')
  })
  it('429 + Retry-After -> RateLimit retentavel com retryAposMs', async () => {
    const r = await enviarCom({ status: 429, json: { error: { code: 130429 } }, headers: { 'retry-after': '2' } })
    expect(!r.ok && r.erro.tipo).toBe('RateLimit')
    expect(!r.ok && r.erro.retentavel).toBe(true)
  })
  it('500 -> Transitorio retentavel', async () => {
    const r = await enviarCom({ status: 500, json: {} })
    expect(!r.ok && r.erro.tipo).toBe('Transitorio')
    expect(!r.ok && r.erro.retentavel).toBe(true)
  })
  it('190 -> Permanente com codigo credencial_invalida', async () => {
    const r = await enviarCom({ json: { error: { code: 190 } } })
    expect(!r.ok && r.erro.tipo).toBe('Permanente')
    expect(!r.ok && r.erro.codigo).toBe('credencial_invalida')
  })
})

// ---- download de midia ----

describe('cliente_meta: baixarMidia', () => {
  it('busca metadados no Graph e baixa o binario da CDN', async () => {
    const { fetchImpl, chamadas } = criarFetchFake((c) =>
      c.url.includes('lookaside.fbsbx.com')
        ? { bytes: new Uint8Array([9, 8, 7]), headers: { 'content-type': 'audio/ogg' } }
        : { json: { url: 'https://lookaside.fbsbx.com/m/xyz', mime_type: 'audio/ogg' } },
    )
    const cliente = criarClienteWhatsMeta({ appSecret: APP_SECRET, fetchImpl, resolverDns })
    const r = await cliente.baixarMidia({ numero: numero(), mediaId: 'media-1' })
    expect(r.ok && r.valor.mimeType).toBe('audio/ogg')
    expect(r.ok && Array.from(r.valor.bytes)).toEqual([9, 8, 7])
    expect(chamadas.map((c) => c.metodo)).toEqual(['GET', 'GET'])
  })

  it('midia acima do limite declarado (content-length) e rejeitada', async () => {
    const { fetchImpl } = criarFetchFake((c) =>
      c.url.includes('lookaside.fbsbx.com')
        ? { bytes: new Uint8Array([1]), headers: { 'content-length': String(999_999_999) } }
        : { json: { url: 'https://lookaside.fbsbx.com/m/big', mime_type: 'image/png' } },
    )
    const cliente = criarClienteWhatsMeta({ appSecret: APP_SECRET, fetchImpl, resolverDns, maxMidiaBytes: 10 })
    const r = await cliente.baixarMidia({ numero: numero(), mediaId: 'media-big' })
    expect(!r.ok && r.erro.codigo).toBe('midia_grande')
  })
})

// ---- SEC-070 (SSRF) ----

describe('cliente_meta: SEC-070 (SSRF)', () => {
  it('redirect para rede link-local (169.254.x) e bloqueado', async () => {
    const { fetchImpl } = criarFetchFake(() => ({ status: 302, headers: { location: 'http://169.254.169.254/latest' } }))
    const cliente = criarClienteWhatsMeta({ appSecret: APP_SECRET, fetchImpl, resolverDns })
    const r = await cliente.enviarTexto({ numero: numero(), para, texto: 'oi' })
    expect(!r.ok && r.erro.codigo).toBe('ssrf_bloqueado')
  })

  it('host que resolve para rede privada e bloqueado (anti-rebinding)', async () => {
    const { fetchImpl } = criarFetchFake(() => ({ json: { messages: [{ id: 'x' }] } }))
    const cliente = criarClienteWhatsMeta({
      appSecret: APP_SECRET,
      fetchImpl,
      resolverDns: async () => ['127.0.0.1'],
    })
    const r = await cliente.enviarTexto({ numero: numero(), para, texto: 'oi' })
    expect(!r.ok && r.erro.codigo).toBe('ssrf_bloqueado')
  })
})

// ---- SEC-024 (token nunca vaza em log nem em erro) ----

describe('cliente_meta: SEC-024 (segredo)', () => {
  it('nao loga nada e o token nunca aparece na URL nem no erro propagado', async () => {
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m))
    const token = 'token-super-secreto-123'
    const { fetchImpl, chamadas } = criarFetchFake(() => ({ status: 500, json: { error: { code: 131000 } } }))
    const cliente = criarClienteWhatsMeta({ appSecret: APP_SECRET, fetchImpl, resolverDns })
    const r = await cliente.enviarTexto({
      numero: { phoneNumberId: '77', credencial: new CredencialResolvida(token) },
      para,
      texto: 'conteudo privado',
    })
    expect(r.ok).toBe(false)
    // O token e usado SO no header (correto), nunca na URL.
    expect(chamadas[0]!.url).not.toContain(token)
    expect(chamadas[0]!.headers['Authorization']).toBe(`Bearer ${token}`)
    // E nao vaza no erro propagado nem em nenhum log.
    expect(JSON.stringify(!r.ok && r.erro)).not.toContain(token)
    expect(`${!r.ok && r.erro.message}`).not.toContain(token)
    for (const e of espioes) {
      expect(e).not.toHaveBeenCalled()
      e.mockRestore()
    }
  })
})
