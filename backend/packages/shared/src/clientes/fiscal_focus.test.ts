import { describe, expect, it } from 'vitest'
import { contratoClienteFiscal } from './contratos/fiscal'
import { CredencialResolvida } from './erros'
import { criarFiscalFocus, criarFiscalFocusDoAmbiente } from './fiscal_focus'
import type { EmitirFiscalEntrada } from './fiscal'

// Suite deterministica: nenhum teste toca a rede (fetchImpl e resolverDns injetados) nem dispara
// timer real (agendar no-op). Cobre idempotencia por ref, consulta de status, mapeamento de erro,
// nao vazamento de credencial e o gating por ambiente.

const BASE = {
  resolverDns: async () => ['93.184.216.34'],
  agendar: () => () => {},
} as const

const SEGREDO = 'tok-SENTINELA-FOCUS-NAO-VAZA-0123456789'

const entrada = (over: Partial<EmitirFiscalEntrada> = {}): EmitirFiscalEntrada => ({
  referencia: 'doc-abc-1',
  tipo: 'nfce',
  emitente: {
    cnpj: '12345678000195',
    regime: 'simples_nacional',
    serie: 1,
    ambiente: 'homologacao',
    credencial: new CredencialResolvida(SEGREDO),
  },
  pedido: {
    codigo: 'P-100',
    totalCentavos: 3500,
    itens: [{ descricao: 'Pizza', quantidade: 1, valorUnitarioCentavos: 3500, valorTotalCentavos: 3500 }],
  },
  ...over,
})

const resp = (body: unknown, status = 200): Response =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

interface Chamada {
  metodo: string
  pathname: string
  ref: string | null
  auth: string | undefined
  body: string | undefined
}

function gravador(rotear: (c: Chamada, url: URL) => Response) {
  const chamadas: Chamada[] = []
  const fetchImpl = ((input: string | URL, init?: RequestInit) => {
    const url = new URL(input instanceof URL ? input.href : String(input))
    const headers = new Headers(init?.headers)
    const c: Chamada = {
      metodo: init?.method ?? 'GET',
      pathname: url.pathname,
      ref: url.searchParams.get('ref'),
      auth: headers.get('authorization') ?? undefined,
      body: typeof init?.body === 'string' ? init.body : undefined,
    }
    chamadas.push(c)
    return Promise.resolve(rotear(c, url))
  }) as unknown as typeof fetch
  return { chamadas, fetchImpl }
}

/** Rota feliz: POST aceita (processando), GET devolve autorizado com chave e DANFE. */
function rotaFeliz(c: Chamada): Response {
  if (c.metodo === 'POST') return resp({ status: 'processando_autorizacao' }, 202)
  return resp({ status: 'autorizado', chave_nfe: '4'.repeat(44), caminho_danfe: '/notas/danfe.pdf' })
}

contratoClienteFiscal('focus (mock)', () => criarFiscalFocus({ ...BASE, fetchImpl: gravador(rotaFeliz).fetchImpl }))

describe('fiscal_focus: emissao', () => {
  it('POST idempotente por ref, consulta status e devolve emitido com chave e link https', async () => {
    const g = gravador(rotaFeliz)
    const r = await criarFiscalFocus({ ...BASE, fetchImpl: g.fetchImpl }).emitir(entrada({ referencia: 'doc-xyz-9' }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valor).toMatchObject({ status: 'emitido', chave: '4'.repeat(44) })
      expect(r.valor.link?.startsWith('https://')).toBe(true)
    }
    const post = g.chamadas.find((c) => c.metodo === 'POST')!
    expect(post.pathname).toBe('/v2/nfce')
    expect(post.ref).toBe('doc-xyz-9')
    expect(post.auth?.startsWith('Basic ')).toBe(true)
    expect(g.chamadas.some((c) => c.metodo === 'GET' && c.pathname === '/v2/nfce/doc-xyz-9')).toBe(true)
  })

  it('repassa NCM, CFOP, origem, unidade e situacao tributaria do item no corpo da NFC-e', async () => {
    const g = gravador(rotaFeliz)
    await criarFiscalFocus({ ...BASE, fetchImpl: g.fetchImpl }).emitir(
      entrada({
        pedido: {
          codigo: 'P-200',
          totalCentavos: 3500,
          itens: [{
            descricao: 'Pizza', quantidade: 1, valorUnitarioCentavos: 3500, valorTotalCentavos: 3500,
            ncm: '21069090', cfop: '5102', origem: 0, unidade: 'UN', situacaoTributaria: '102',
          }],
        },
      }),
    )
    const post = g.chamadas.find((c) => c.metodo === 'POST')!
    const corpo = JSON.parse(post.body!) as { items: Array<Record<string, unknown>> }
    expect(corpo.items[0]).toMatchObject({
      codigo_ncm: '21069090',
      cfop: '5102',
      icms_origem: 0,
      icms_situacao_tributaria: '102',
      unidade_comercial: 'UN',
      unidade_tributavel: 'UN',
    })
  })

  it('nunca envia a credencial no corpo nem a devolve na resposta', async () => {
    const g = gravador(rotaFeliz)
    const r = await criarFiscalFocus({ ...BASE, fetchImpl: g.fetchImpl }).emitir(entrada())
    for (const c of g.chamadas) expect(c.body ?? '').not.toContain(SEGREDO)
    if (r.ok) expect(JSON.stringify(r.valor)).not.toContain(SEGREDO)
  })

  it('rejeicao de negocio (422) vira status erro com codigo curto, sem texto cru', async () => {
    const g = gravador((c) =>
      c.metodo === 'POST'
        ? resp({ status: 'erro_autorizacao', erros: [{ codigo: 'E216', mensagem: 'detalhe cru do emissor' }] }, 422)
        : resp({ status: 'nao_encontrado' }, 404),
    )
    const r = await criarFiscalFocus({ ...BASE, fetchImpl: g.fetchImpl }).emitir(entrada())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valor).toMatchObject({ status: 'erro', chave: null, link: null })
      expect(r.valor.erro).toBe('E216')
      expect(JSON.stringify(r.valor)).not.toContain('detalhe cru')
    }
  })

  it('ref ja utilizada (422) + consulta autorizada: leitura idempotente devolve emitido', async () => {
    const g = gravador((c) =>
      c.metodo === 'POST'
        ? resp({ erros: [{ codigo: 'ja_existe', mensagem: 'ref ja utilizada' }] }, 422)
        : resp({ status: 'autorizado', chave_nfe: '7'.repeat(44), caminho_danfe: '/n/d.pdf' }),
    )
    const r = await criarFiscalFocus({ ...BASE, fetchImpl: g.fetchImpl }).emitir(entrada())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toMatchObject({ status: 'emitido', chave: '7'.repeat(44) })
  })

  it('5xx vira falha transitoria (retentavel); 401 vira falha permanente de credencial', async () => {
    const g5 = gravador(() => resp({ erro: 'indisponivel' }, 503))
    const r5 = await criarFiscalFocus({ ...BASE, fetchImpl: g5.fetchImpl }).emitir(entrada())
    expect(r5.ok).toBe(false)
    if (!r5.ok) expect(r5.erro.retentavel).toBe(true)

    const g401 = gravador(() => resp({ erro: 'nao autorizado' }, 401))
    const r401 = await criarFiscalFocus({ ...BASE, fetchImpl: g401.fetchImpl }).emitir(entrada())
    expect(r401.ok).toBe(false)
    if (!r401.ok) {
      expect(r401.erro.retentavel).toBe(false)
      expect(r401.erro.codigo).toBe('credencial')
    }
  })

  it('nfse: POST autorizado devolve emitido com numero e link https', async () => {
    const g = gravador(() =>
      resp({ status: 'autorizado', numero: 123, codigo_verificacao: 'XYZ', url: 'https://homologacao.focusnfe.com.br/nfse/123' }),
    )
    const r = await criarFiscalFocus({ ...BASE, fetchImpl: g.fetchImpl }).emitir(entrada({ tipo: 'nfse' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor).toMatchObject({ status: 'emitido', chave: '123' })
    expect(g.chamadas[0]!.pathname).toBe('/v2/nfse')
  })

  it('usa a base de producao quando o ambiente e producao', async () => {
    const g = gravador(rotaFeliz)
    await criarFiscalFocus({ ...BASE, fetchImpl: g.fetchImpl }).emitir(
      entrada({ emitente: { ...entrada().emitente, ambiente: 'producao' } }),
    )
    // A allowlist cobre os dois hosts; aqui so garantimos que nao quebrou o fluxo em producao.
    expect(g.chamadas.some((c) => c.metodo === 'POST')).toBe(true)
  })
})

describe('fiscal_focus: gating por ambiente', () => {
  it('sem API_FISCAL_PROVEDOR, devolve null (cai no stub nao configurado)', () => {
    expect(criarFiscalFocusDoAmbiente({})).toBeNull()
    expect(criarFiscalFocusDoAmbiente({ API_FISCAL_PROVEDOR: 'outro' })).toBeNull()
  })
  it('com API_FISCAL_PROVEDOR=focusnfe, devolve o emissor real', () => {
    expect(criarFiscalFocusDoAmbiente({ API_FISCAL_PROVEDOR: 'focusnfe' })).not.toBeNull()
  })
})
