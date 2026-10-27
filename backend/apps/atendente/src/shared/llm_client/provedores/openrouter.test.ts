import { describe, expect, it } from 'vitest'
import { CredencialResolvida, type RequisicaoLlm, type ResolverDns } from '@whaviso/shared/clientes'
import { contratoClienteLLM } from '@whaviso/shared/clientes/testing'
import { criarAdaptadorOpenRouter, NO_TRAIN } from './openrouter'

// Servidor HTTP falso do provedor: captura cada request e devolve uma resposta enlatada por rota.
// Nunca ha rede real; o DNS e injetado para resolver a um IP publico (deixa o fetchSeguro passar).

const SENTINELA = 'sk-or-sentinela-unica-9f3a7c21'
const DNS_PUBLICO: ResolverDns = async () => ['93.184.216.34']

interface ReqCapturada {
  url: string
  init: RequestInit | undefined
}

interface OpcoesFake {
  status?: number
  corpo?: unknown
  /** resposta por sufixo de caminho (ex.: '/embeddings'); senao usa corpo/status. */
  porRota?: Record<string, { status?: number; corpo?: unknown }>
  /** devolve um redirect (Location) em vez de corpo. */
  redirecionarPara?: string
}

function fakeFetch(op: OpcoesFake, capturadas: ReqCapturada[]): typeof fetch {
  return (async (url: URL | string, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString()
    capturadas.push({ url: u, init })
    if (op.redirecionarPara) {
      return new Response(null, { status: 302, headers: { location: op.redirecionarPara } })
    }
    const rota = Object.keys(op.porRota ?? {}).find((r) => u.includes(r))
    const cfg = rota ? op.porRota![rota]! : { status: op.status, corpo: op.corpo }
    const status = cfg.status ?? 200
    const corpo = cfg.corpo ?? respostaChatPadrao()
    return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

function respostaChatPadrao(): unknown {
  return {
    model: 'openai/gpt-4o-mini',
    choices: [{ message: { content: 'ola', tool_calls: [] } }],
    usage: { prompt_tokens: 3, completion_tokens: 2 },
  }
}

function adaptadorDeTeste(op: OpcoesFake, capturadas: ReqCapturada[], reqs?: RequisicaoLlm[]) {
  return criarAdaptadorOpenRouter({
    fetchImpl: fakeFetch(op, capturadas),
    resolverDns: DNS_PUBLICO,
    ...(reqs ? { inspetor: (r) => reqs.push(r) } : {}),
  })
}

// --- Suite de contrato de F2 (a implementacao real deve passar) -------------------------------
contratoClienteLLM('adaptador OpenRouter (fetch falso)', () => {
  const capturadas: ReqCapturada[] = []
  const reqs: RequisicaoLlm[] = []
  const cliente = adaptadorDeTeste(
    {
      porRota: {
        '/embeddings': {
          corpo: {
            model: 'openai/gpt-4o-mini',
            data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }],
            usage: { prompt_tokens: 2 },
          },
        },
      },
    },
    capturadas,
    reqs,
  )
  return { cliente, requisicoes: () => reqs }
})

describe('adaptador OpenRouter', () => {
  const credencial = () => new CredencialResolvida(SENTINELA)
  const mensagens = [{ papel: 'user' as const, conteudo: 'quero uma pizza' }]

  it('SEC-026: chave so no header Authorization; corpo/prompt sem a chave; no-train presente', async () => {
    const capturadas: ReqCapturada[] = []
    const reqs: RequisicaoLlm[] = []
    const ad = adaptadorDeTeste({}, capturadas, reqs)
    const r = await ad.completar({ credencial: credencial(), mensagens, formatoSaida: { tipo: 'json' } })
    expect(r.ok).toBe(true)

    // Requisicao montada: chave so no header.
    expect(reqs).toHaveLength(1)
    expect(reqs[0]!.headers['authorization']).toContain(SENTINELA)
    expect(JSON.stringify(reqs[0]!.body)).not.toContain(SENTINELA)
    expect(reqs[0]!.body['provider']).toEqual(NO_TRAIN)

    // Request efetivamente enviada ao provedor: a chave nao esta no corpo nem na URL.
    const enviado = capturadas[0]!
    expect(enviado.url).not.toContain(SENTINELA)
    expect(String(enviado.init?.body)).not.toContain(SENTINELA)
    expect(String(enviado.init?.body)).toContain('"data_collection":"deny"')
    expect(String(enviado.init?.body)).toContain('"zdr":true')
    expect((enviado.init?.headers as Record<string, string>)['authorization']).toContain(SENTINELA)
  })

  it('SEC-020: a chave nunca aparece no resultado devolvido pelo adaptador', async () => {
    const capturadas: ReqCapturada[] = []
    const ad = adaptadorDeTeste({}, capturadas)
    const r = await ad.completar({ credencial: credencial(), mensagens })
    expect(JSON.stringify(r)).not.toContain(SENTINELA)
  })

  it('estima o custo em centavos a partir dos tokens e da tabela de precos', async () => {
    const capturadas: ReqCapturada[] = []
    const ad = criarAdaptadorOpenRouter({
      fetchImpl: fakeFetch(
        {
          corpo: {
            model: 'openai/gpt-4o-mini', // 15 c/M entrada, 60 c/M saida
            choices: [{ message: { content: 'ok', tool_calls: [] } }],
            usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
          },
        },
        capturadas,
      ),
      resolverDns: DNS_PUBLICO,
    })
    const r = await ad.completar({ credencial: credencial(), mensagens })
    expect(r.ok && r.valor.uso.custoEstimadoCentavos).toBe(75) // 15 + 60
    expect(r.ok && Number.isInteger(r.valor.uso.custoEstimadoCentavos)).toBe(true)
  })

  it('tool_calls viram dados estruturados (argumentos como objeto, nunca comando)', async () => {
    const capturadas: ReqCapturada[] = []
    const ad = criarAdaptadorOpenRouter({
      fetchImpl: fakeFetch(
        {
          corpo: {
            model: 'm',
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [{ id: 't1', function: { name: 'consultar_preco', arguments: '{"item":"x"}' } }],
                },
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          },
        },
        capturadas,
      ),
      resolverDns: DNS_PUBLICO,
    })
    const r = await ad.completar({ credencial: credencial(), mensagens })
    expect(r.ok && r.valor.chamadasFerramenta[0]).toEqual({ id: 't1', nome: 'consultar_preco', argumentos: { item: 'x' } })
  })

  it('classifica erros do provedor por status (chave_invalida, limite, conteudo, transitorio, rota)', async () => {
    const casos: Array<[number, unknown, string]> = [
      [401, { error: { code: 'auth' } }, 'chave_invalida'],
      [403, {}, 'chave_invalida'],
      [402, {}, 'limite'],
      [429, {}, 'RateLimit'],
      [500, {}, 'transitorio'],
      [400, { error: { code: 'moderation' } }, 'conteudo'],
      [404, { error: { code: 'no_providers' } }, 'rota'],
    ]
    for (const [status, corpo, codigo] of casos) {
      const capturadas: ReqCapturada[] = []
      const ad = adaptadorDeTeste({ status, corpo }, capturadas)
      const r = await ad.completar({ credencial: credencial(), mensagens })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.erro.codigo).toBe(codigo)
    }
  })

  it('SEC-070: nao segue redirect (recusa, nao vai para rede interna)', async () => {
    const capturadas: ReqCapturada[] = []
    const ad = adaptadorDeTeste({ redirecionarPara: 'http://169.254.169.254/' }, capturadas)
    const r = await ad.completar({ credencial: credencial(), mensagens })
    expect(r.ok).toBe(false)
    // Uma unica tentativa: o redirect nao foi seguido.
    expect(capturadas).toHaveLength(1)
  })

  it('SEC-070: host que resolve para rede nao publica e bloqueado (anti-rebinding)', async () => {
    const capturadas: ReqCapturada[] = []
    const ad = criarAdaptadorOpenRouter({
      fetchImpl: fakeFetch({}, capturadas),
      resolverDns: async () => ['169.254.169.254'], // openrouter.ai resolvendo para link-local
    })
    const r = await ad.completar({ credencial: credencial(), mensagens })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('ssrf_bloqueado')
    expect(capturadas).toHaveLength(0) // nunca chegou a chamar o fetch
  })

  it('SEC-070: baseUrl fora da allowlist e recusado', async () => {
    const capturadas: ReqCapturada[] = []
    const ad = criarAdaptadorOpenRouter({
      baseUrl: 'https://evil.example.com/api/v1',
      fetchImpl: fakeFetch({}, capturadas),
      resolverDns: DNS_PUBLICO,
    })
    const r = await ad.completar({ credencial: credencial(), mensagens })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro.codigo).toBe('ssrf_bloqueado')
    expect(capturadas).toHaveLength(0)
  })
})
