import { z } from 'zod'
import {
  falha,
  ok,
  ErroProvedor,
  Permanente,
  RateLimit,
  Transitorio,
  type HostPermitido,
  type Resultado,
} from './erros'
import { fetchSeguro, type ResolverDns } from './fetch_seguro'
import { comTimeout, Disjuntor, type Agendar, type Relogio } from './resiliencia'
import type {
  ClienteFiscal,
  EmitirFiscalEntrada,
  EmitirFiscalResposta,
  TipoFiscal,
} from './fiscal'

// Implementacao real de ClienteFiscal sobre a Focus NFe (emissor de terceiro, REST documentado).
//
// POR QUE A FOCUS NFe (default):
// - API REST publica e bem documentada de NFC-e e NFS-e (nao reconstruimos motor fiscal por UF);
// - idempotencia nativa por `ref` na URL (reenvio nao duplica a nota), que casa 1:1 com o
//   `referencia` do nosso contrato (o id do documento reservado no banco);
// - separacao de ambiente por HOST (homologacao x producao), que casa com `emitente.ambiente`;
// - autenticacao simples por token (HTTP Basic, token como usuario), entregue aqui dentro de
//   `CredencialResolvida` (opaca, nunca em log); consulta de status por `GET /v2/{tipo}/{ref}`.
// Alternativas equivalentes (NFe.io, Tecnospeed) seguem a mesma interface; trocar de provedor e
// uma nova implementacao atras de `ClienteFiscal`, sem tocar no modulo fiscal.
//
// LIMITE HONESTO (go-live): o corpo de NFC-e exige atributos fiscais por item (NCM, CFOP, situacao
// tributaria/CSOSN) que o nosso `ItemFiscal` minimo NAO carrega. Montamos o corpo com o que temos e
// deixamos esses campos a cargo do cadastro fiscal da loja/catalogo; a emissao real so passa na
// SEFAZ com esses dados completos e com uma conta Focus NFe valida (token por loja). Aqui garantimos
// a mecanica correta (ref idempotente, consulta de status, mapeamento de erro, credencial, SSRF).

export interface ConfigFiscalFocus {
  /** Base HTTPS do ambiente de homologacao (default: https://homologacao.focusnfe.com.br). */
  baseUrlHomologacao?: string
  /** Base HTTPS do ambiente de producao (default: https://api.focusnfe.com.br). */
  baseUrlProducao?: string
  timeoutMs?: number
  disjuntorLimiar?: number
  disjuntorReabrirMs?: number
  /** Injecoes para teste (nunca rede real na suite). */
  fetchImpl?: typeof fetch
  resolverDns?: ResolverDns
  relogio?: Relogio
  agendar?: Agendar
}

const PADRAO = {
  baseUrlHomologacao: 'https://homologacao.focusnfe.com.br',
  baseUrlProducao: 'https://api.focusnfe.com.br',
  timeoutMs: 15_000,
  disjuntorLimiar: 5,
  disjuntorReabrirMs: 30_000,
} as const

const semBarra = (u: string) => u.replace(/\/+$/, '')
const hostDe = (u: string) => new URL(u).hostname
const reais = (centavos: number) => (centavos / 100).toFixed(2)

/** Resposta (parcial) de uma nota na Focus NFe. Campos desconhecidos sao descartados. */
const NotaFocus = z.object({
  status: z.string().optional(),
  status_sefaz: z.string().optional(),
  mensagem_sefaz: z.string().optional(),
  chave_nfe: z.string().optional(),
  numero: z.union([z.string(), z.number()]).optional(),
  codigo_verificacao: z.string().optional(),
  caminho_danfe: z.string().optional(),
  caminho_xml_nota_fiscal: z.string().optional(),
  url: z.string().optional(),
  codigo: z.string().optional(),
  erros: z.array(z.object({ codigo: z.string().optional(), mensagem: z.string().optional() })).optional(),
})
type NotaFocus = z.infer<typeof NotaFocus>

/** Status terminal de autorizacao na Focus NFe. */
const AUTORIZADO = new Set(['autorizado'])
const PENDENTE = new Set(['processando_autorizacao', 'processando', 'enviado', 'em_processamento'])

/** Codigo curto e seguro (nunca texto cru/longo) a partir do estado de erro da nota. */
function codigoErro(n: NotaFocus): string {
  const bruto = n.erros?.[0]?.codigo ?? n.codigo ?? n.status_sefaz ?? n.status ?? 'rejeitado'
  return bruto.replace(/[^a-z0-9_]/gi, '_').slice(0, 60) || 'rejeitado'
}

/** Mapeia status HTTP != 2xx (e != 4xx de negocio) para erro tipado. */
function erroHttp(status: number): ErroProvedor {
  if (status === 429) return new RateLimit('limite de taxa do emissor', undefined, { codigo: 'http_429' })
  if (status >= 500) return new Transitorio('emissor indisponivel', { codigo: `http_${status}` })
  if (status === 401 || status === 403) return new Permanente('credencial recusada pelo emissor', { codigo: 'credencial' })
  return new Permanente('emissor rejeitou a requisicao', { codigo: `http_${status}` })
}

function erroTransporte(e: unknown): ErroProvedor {
  if (e instanceof ErroProvedor) return e
  if (e instanceof Error && e.name === 'AbortError') return new Transitorio('tempo esgotado', { codigo: 'timeout' })
  return new Transitorio('falha de rede com o emissor', { codigo: 'rede' })
}

/**
 * Corpo minimo de NFC-e. Os atributos fiscais por item (NCM, CFOP, origem, unidade, situacao
 * tributaria) sao DADO do catalogo da loja: a api so chega aqui depois de validar que estao
 * presentes, entao sao incluidos quando vierem (chaves da Focus: `codigo_ncm`, `cfop`,
 * `unidade_comercial`/`unidade_tributavel`, `icms_origem`, `icms_situacao_tributaria`). A Focus
 * trata CSOSN e CST pelo mesmo campo `icms_situacao_tributaria`; a api ja resolve qual pelo regime.
 */
function corpoNfce(entrada: EmitirFiscalEntrada): unknown {
  const { emitente, pedido } = entrada
  return {
    cnpj_emitente: emitente.cnpj,
    data_emissao: new Date().toISOString(),
    natureza_operacao: 'Venda ao consumidor',
    presenca_comprador: 1,
    modalidade_frete: 9,
    local_destino: 1,
    serie: emitente.serie,
    items: pedido.itens.map((it, i) => {
      const unidade = it.unidade ?? 'UN'
      return {
        numero_item: i + 1,
        codigo_produto: String(i + 1),
        descricao: it.descricao,
        quantidade_comercial: it.quantidade,
        quantidade_tributavel: it.quantidade,
        valor_unitario_comercial: reais(it.valorUnitarioCentavos),
        valor_unitario_tributavel: reais(it.valorUnitarioCentavos),
        valor_bruto: reais(it.valorTotalCentavos),
        unidade_comercial: unidade,
        unidade_tributavel: unidade,
        ...(it.ncm !== undefined ? { codigo_ncm: it.ncm } : {}),
        ...(it.cfop !== undefined ? { cfop: it.cfop } : {}),
        ...(it.origem !== undefined ? { icms_origem: it.origem } : {}),
        ...(it.situacaoTributaria !== undefined ? { icms_situacao_tributaria: it.situacaoTributaria } : {}),
      }
    }),
    formas_pagamento: [{ forma_pagamento: '01', valor_pagamento: reais(pedido.totalCentavos) }],
  }
}

/** Corpo minimo de NFS-e (servico). O item de servico e o resumo do pedido. */
function corpoNfse(entrada: EmitirFiscalEntrada): unknown {
  const { emitente, pedido } = entrada
  return {
    data_emissao: new Date().toISOString(),
    prestador: { cnpj: emitente.cnpj },
    servico: {
      discriminacao: pedido.itens.map((i) => `${i.quantidade}x ${i.descricao}`).join('; ').slice(0, 1000),
      valor_servicos: reais(pedido.totalCentavos),
    },
  }
}

class ClienteFiscalFocus implements ClienteFiscal {
  readonly #baseHomologacao: string
  readonly #baseProducao: string
  readonly #timeoutMs: number
  readonly #hosts: readonly HostPermitido[]
  readonly #fetchImpl?: typeof fetch
  readonly #resolverDns?: ResolverDns
  readonly #agendar?: Agendar
  readonly #disjuntor: Disjuntor

  constructor(cfg: ConfigFiscalFocus = {}) {
    this.#baseHomologacao = semBarra(cfg.baseUrlHomologacao ?? PADRAO.baseUrlHomologacao)
    this.#baseProducao = semBarra(cfg.baseUrlProducao ?? PADRAO.baseUrlProducao)
    this.#timeoutMs = cfg.timeoutMs ?? PADRAO.timeoutMs
    // new URL lanca cedo se a base for invalida (erro de configuracao, nao de runtime).
    this.#hosts = [...new Set([hostDe(this.#baseHomologacao), hostDe(this.#baseProducao)])]
    this.#fetchImpl = cfg.fetchImpl
    this.#resolverDns = cfg.resolverDns
    this.#agendar = cfg.agendar
    this.#disjuntor = new Disjuntor({
      limiar: cfg.disjuntorLimiar ?? PADRAO.disjuntorLimiar,
      reabrirAposMs: cfg.disjuntorReabrirMs ?? PADRAO.disjuntorReabrirMs,
      relogio: cfg.relogio,
    })
  }

  /** Base do ambiente. Link https so e devolvido quando o caminho resolve para a base do provedor. */
  #linkSeguro(base: string, caminho: string | undefined): string | null {
    if (!caminho) return null
    try {
      const u = new URL(caminho, base + '/')
      return u.protocol === 'https:' ? u.href.slice(0, 2048) : null
    } catch {
      return null
    }
  }

  /**
   * Uma chamada HTTP ao emissor. Devolve `ok` com corpo JSON para QUALQUER resposta de negocio
   * (2xx e 4xx que nao seja credencial), e `falha` tipada para transporte/timeout/429/5xx/401/403.
   */
  async #pedir(
    base: string,
    metodo: 'GET' | 'POST',
    caminho: string,
    auth: string,
    corpo?: unknown,
  ): Promise<Resultado<{ http: number; corpo: unknown }, ErroProvedor>> {
    return this.#disjuntor.executar(() =>
      comTimeout(
        async (sinal) => {
          let resp: Response
          try {
            resp = await fetchSeguro(base + caminho, {
              hostsPermitidos: this.#hosts,
              init: {
                method: metodo,
                headers: {
                  authorization: auth,
                  accept: 'application/json',
                  ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}),
                },
                body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
                signal: sinal,
              },
              fetchImpl: this.#fetchImpl,
              resolverDns: this.#resolverDns,
            })
          } catch (e) {
            return falha(erroTransporte(e))
          }
          // 401/403/429/5xx: transporte/credencial (retentavel ou nao decide o chamador).
          if (resp.status === 429 || resp.status >= 500 || resp.status === 401 || resp.status === 403) {
            return falha(erroHttp(resp.status))
          }
          let corpoJson: unknown = null
          try {
            corpoJson = await resp.json()
          } catch {
            corpoJson = null
          }
          return ok({ http: resp.status, corpo: corpoJson })
        },
        this.#timeoutMs,
        this.#agendar,
      ),
    )
  }

  /** Traduz uma nota da Focus em resposta do contrato. */
  #interpretar(base: string, corpo: unknown): EmitirFiscalResposta {
    const parsed = NotaFocus.safeParse(corpo)
    if (!parsed.success) return { status: 'pendente', chave: null, link: null, erro: null }
    const n = parsed.data
    const status = (n.status ?? '').toLowerCase()
    if (AUTORIZADO.has(status)) {
      const chave = n.chave_nfe ?? (n.numero != null ? String(n.numero) : null) ?? n.codigo_verificacao ?? null
      const link = this.#linkSeguro(base, n.caminho_danfe ?? n.url ?? n.caminho_xml_nota_fiscal)
      return { status: 'emitido', chave, link, erro: null }
    }
    if (PENDENTE.has(status) || status === '') {
      return { status: 'pendente', chave: null, link: null, erro: null }
    }
    // Qualquer outro status e rejeicao de negocio (erro_autorizacao, rejeitado, denegado, cancelado).
    return { status: 'erro', chave: null, link: null, erro: codigoErro(n) }
  }

  async emitir(entrada: EmitirFiscalEntrada): Promise<Resultado<EmitirFiscalResposta, ErroProvedor>> {
    const base = entrada.emitente.ambiente === 'producao' ? this.#baseProducao : this.#baseHomologacao
    const auth = 'Basic ' + Buffer.from(`${entrada.emitente.credencial.revelar()}:`).toString('base64')
    const tipo: TipoFiscal = entrada.tipo
    const ref = encodeURIComponent(entrada.referencia)
    const corpo = tipo === 'nfce' ? corpoNfce(entrada) : corpoNfse(entrada)

    const post = await this.#pedir(base, 'POST', `/v2/${tipo}?ref=${ref}`, auth, corpo)
    if (!post.ok) return post

    // 422: pode ser rejeicao de negocio OU "ref ja utilizada" (idempotencia). Em ambos os casos a
    // consulta por ref devolve o estado atual da nota, que e a fonte da verdade.
    if (post.valor.http === 422 || post.valor.http === 409) {
      const consulta = await this.#pedir(base, 'GET', `/v2/${tipo}/${ref}`, auth)
      if (consulta.ok && consulta.valor.http < 400) return ok(this.#interpretar(base, consulta.valor.corpo))
      // Nota nao encontrada na consulta: a rejeicao do POST e definitiva.
      return ok(this.#interpretar(base, post.valor.corpo))
    }

    const inicial = this.#interpretar(base, post.valor.corpo)
    if (inicial.status !== 'pendente') return ok(inicial)

    // Aceita assincrono: consulta o status atual uma vez (a nota costuma autorizar em segundos).
    const consulta = await this.#pedir(base, 'GET', `/v2/${tipo}/${ref}`, auth)
    if (consulta.ok && consulta.valor.http < 400) return ok(this.#interpretar(base, consulta.valor.corpo))
    return ok(inicial)
  }
}

export function criarFiscalFocus(cfg: ConfigFiscalFocus = {}): ClienteFiscal {
  return new ClienteFiscalFocus(cfg)
}

/**
 * Monta o ClienteFiscal real (Focus NFe) a partir do ambiente (convencao API_*). Gating por
 * OPT-IN explicito: so devolve o emissor real quando `API_FISCAL_PROVEDOR=focusnfe`. Sem isso
 * (dev/offline/testes), devolve `null` e o modulo cai no stub `emissorNaoConfigurado`. O token do
 * emissor NAO vem do ambiente: e por loja, cifrado no banco, entregue por chamada. Vars:
 *   API_FISCAL_PROVEDOR            'focusnfe' para ativar (default: ausente -> stub)
 *   API_FISCAL_FOCUS_URL_HOMOLOGACAO  opcional: base HTTPS de homologacao
 *   API_FISCAL_FOCUS_URL_PRODUCAO     opcional: base HTTPS de producao
 *   API_FISCAL_TIMEOUT_MS         opcional: teto por chamada (default 15000)
 */
export function criarFiscalFocusDoAmbiente(
  env: Record<string, string | undefined> = process.env,
): ClienteFiscal | null {
  if ((env.API_FISCAL_PROVEDOR ?? '').trim().toLowerCase() !== 'focusnfe') return null
  const inteiro = (v: string | undefined) => {
    const n = v?.trim() ? Number(v.trim()) : NaN
    return Number.isInteger(n) && n > 0 ? n : undefined
  }
  return criarFiscalFocus({
    baseUrlHomologacao: env.API_FISCAL_FOCUS_URL_HOMOLOGACAO?.trim() || undefined,
    baseUrlProducao: env.API_FISCAL_FOCUS_URL_PRODUCAO?.trim() || undefined,
    timeoutMs: inteiro(env.API_FISCAL_TIMEOUT_MS),
  })
}
