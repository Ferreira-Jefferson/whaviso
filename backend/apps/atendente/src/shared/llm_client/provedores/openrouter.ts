// Adaptador OpenRouter: implementa a porta `ClienteLLM` sobre a API do OpenRouter.
//
// Travas de seguranca (nao negociaveis):
//   - URL base FIXA no codigo + allowlist de host, via `fetchSeguro` (unico caminho de saida HTTP,
//     SEC-070). `maxRedirects: 0` recusa seguir redirect (equivale ao `redirect: 'error'` da spec);
//     `fetchSeguro` ainda barra HTTP, IP literal e resolucao para rede interna (169.254/localhost).
//   - A chave vai SO no header `Authorization: Bearer ...` (SEC-026), montado por `montarRequisicaoLlm`
//     para `completar`; NUNCA no corpo, no prompt, na URL ou em log.
//   - Politica NO-TRAIN por requisicao (ver NO_TRAIN abaixo): o corpo pede so provedores que nao
//     coletam/treinam e com retencao zero; rotas que nao honram sao recusadas pelo proprio OpenRouter.
//   - Erros sao SANITIZADOS: mapeamos status -> erro tipado com `codigo` estavel; nunca anexamos o
//     corpo bruto, os headers nem a `causa` da falha de rede (poderiam carregar a chave/URL).
import {
  fetchSeguro,
  montarRequisicaoLlm,
  ok,
  falha,
  POLITICA_LLM,
  ErroProvedor,
  Permanente,
  RateLimit,
  Transitorio,
  type CompletarEntrada,
  type DescreverImagemEntrada,
  type EmbutirEntrada,
  type PoliticaCliente,
  type RequisicaoLlm,
  type Resultado,
  type RespostaCompletar,
  type RespostaDescreverImagem,
  type RespostaEmbutir,
  type RespostaTranscrever,
  type ResolverDns,
  type TranscreverEntrada,
  type UsoLlm,
} from '@whaviso/shared/clientes'
import {
  custoEstimadoCentavos,
  OPENROUTER_BASE_URL,
  OPENROUTER_HOSTS,
  OPENROUTER_MODELO_PADRAO,
  PRECOS_PADRAO,
  type TabelaPrecos,
} from '../config'
import { ChaveInvalida, ConteudoRecusado, LimiteProvedor } from '../erros'
import type { AdaptadorProvedor } from './porta'

/**
 * Politica NO-TRAIN do OpenRouter, enviada no corpo de toda requisicao (bloco `provider`):
 *   - `data_collection: 'deny'`  => roteia SO para provedores que NAO coletam/treinam nos dados;
 *   - `zdr: true`                => roteia SO para endpoints com Zero Data Retention.
 * Se nenhuma rota honrar, o OpenRouter recusa a requisicao (sem provedor elegivel) em vez de enviar.
 * Doc: https://openrouter.ai/docs/features/provider-routing (secoes "Data collection" e "ZDR").
 */
export const NO_TRAIN = { data_collection: 'deny', zdr: true } as const

export interface OpcoesOpenRouter {
  baseUrl?: string
  hostsPermitidos?: readonly string[]
  modeloPadrao?: string
  precos?: TabelaPrecos
  politica?: PoliticaCliente
  /** Limite de tokens de saida por chamada (protege custo). */
  maxTokens?: number
  fetchImpl?: typeof fetch
  resolverDns?: ResolverDns
  /**
   * Inspetor de requisicao montada (headers + body) SO para teste de contrato (SEC-026). Em
   * producao fica indefinido: o adaptador NAO retem a requisicao (que carrega a chave no header).
   */
  inspetor?: (req: RequisicaoLlm) => void
}

interface UsoBruto {
  prompt_tokens?: number
  completion_tokens?: number
}

const inteiro = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0)

/** Mapeia o status HTTP (e um codigo de erro do provedor, se houver) para um erro tipado e sanitizado. */
function classificar(status: number, codigoProvedor?: string): ErroProvedor {
  if (status === 429) return new RateLimit()
  if (status === 401 || status === 403) return new ChaveInvalida()
  if (status === 402) return new LimiteProvedor()
  // 404 do OpenRouter com a politica no-train = nenhuma rota/provedor elegivel honra data_collection
  // deny / ZDR. Recusa nao retentavel (retry nao muda a elegibilidade do modelo).
  if (status === 404) return new Permanente('nenhuma rota honra a politica no-train', { codigo: 'rota' })
  if (status === 408 || status >= 500) return new Transitorio('provedor indisponivel', { codigo: 'transitorio' })
  // 4xx restantes: moderacao/conteudo e o caso comum (400/413 com motivo de politica).
  if (codigoProvedor === 'moderation' || status === 451) return new ConteudoRecusado()
  if (status === 400) return new ConteudoRecusado('requisicao recusada pelo provedor')
  return new Transitorio('resposta inesperada do provedor', { codigo: 'transitorio' })
}

/** Le so o `error.code`/`error.type` (metadado curto, nunca a chave) de um corpo de erro JSON. */
function codigoDoErro(corpo: unknown): string | undefined {
  if (corpo && typeof corpo === 'object' && 'error' in corpo) {
    const e = (corpo as { error?: unknown }).error
    if (e && typeof e === 'object') {
      const c = (e as { code?: unknown; type?: unknown }).code ?? (e as { type?: unknown }).type
      if (typeof c === 'string') return c
    }
  }
  return undefined
}

/**
 * Adaptador OpenRouter. `provedor = 'openrouter'`. Reutiliza `montarRequisicaoLlm` em `completar`
 * (a chave vai so no header) e adiciona o bloco NO-TRAIN ao corpo.
 */
export function criarAdaptadorOpenRouter(op: OpcoesOpenRouter = {}): AdaptadorProvedor {
  const baseUrl = op.baseUrl ?? OPENROUTER_BASE_URL
  const hostsPermitidos = op.hostsPermitidos ?? OPENROUTER_HOSTS
  const modeloPadrao = op.modeloPadrao ?? OPENROUTER_MODELO_PADRAO
  const precos = op.precos ?? PRECOS_PADRAO
  const politica = op.politica ?? POLITICA_LLM

  /** POST JSON com as travas de SSRF; devolve {status, corpo} ou lanca erro de rede ja sanitizado. */
  async function postar(
    caminho: string,
    req: RequisicaoLlm,
  ): Promise<{ status: number; corpo: unknown }> {
    op.inspetor?.(req)
    let resp: Response
    try {
      resp = await fetchSeguro(`${baseUrl}${caminho}`, {
        hostsPermitidos,
        timeoutMs: politica.timeoutMs,
        maxRedirects: 0, // recusa redirect (equivale a redirect: 'error'); SEC-070
        init: { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) },
        ...(op.fetchImpl ? { fetchImpl: op.fetchImpl } : {}),
        ...(op.resolverDns ? { resolverDns: op.resolverDns } : {}),
      })
    } catch (erro) {
      // ErroSsrf/Transitorio do fetchSeguro ja sao genericos e tipados: repassa sem causa crua.
      if (erro instanceof ErroProvedor) throw erro
      // Timeout/DNS/abort: Transitorio generico, SEM anexar a causa (poderia referenciar a request/headers).
      throw new Transitorio('falha de rede ao chamar o provedor', { codigo: 'rede' })
    }
    let corpo: unknown = undefined
    try {
      corpo = await resp.json()
    } catch {
      corpo = undefined
    }
    return { status: resp.status, corpo }
  }

  /** Cabecalho de auth do provedor (chave so aqui, nunca no corpo). */
  const authHeader = (chave: string): Record<string, string> => ({
    authorization: `Bearer ${chave}`,
    'content-type': 'application/json',
  })

  function uso(modelo: string | null, bruto: UsoBruto | undefined): UsoLlm {
    const tokensIn = inteiro(bruto?.prompt_tokens)
    const tokensOut = inteiro(bruto?.completion_tokens)
    return { tokensIn, tokensOut, custoEstimadoCentavos: custoEstimadoCentavos(precos, modelo, tokensIn, tokensOut) }
  }

  return {
    provedor: 'openrouter',

    async completar(entrada: CompletarEntrada): Promise<Resultado<RespostaCompletar, ErroProvedor>> {
      // `montarRequisicaoLlm` poe a chave SO no header e o conteudo no body (SEC-026).
      const base = montarRequisicaoLlm(entrada, modeloPadrao)
      const req: RequisicaoLlm = {
        headers: base.headers,
        body: { ...base.body, provider: NO_TRAIN, ...(op.maxTokens ? { max_tokens: op.maxTokens } : {}) },
      }
      let res: { status: number; corpo: unknown }
      try {
        res = await postar('/chat/completions', req)
      } catch (erro) {
        return falha(erro as ErroProvedor)
      }
      if (res.status < 200 || res.status >= 300) {
        return falha(classificar(res.status, codigoDoErro(res.corpo)))
      }
      const corpo = res.corpo as {
        model?: string
        choices?: Array<{
          message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }
        }>
        usage?: UsoBruto
      }
      const msg = corpo.choices?.[0]?.message
      const modelo = corpo.model ?? entrada.modelo ?? modeloPadrao
      const chamadasFerramenta = (msg?.tool_calls ?? [])
        .filter((t) => t.function?.name)
        .map((t) => ({
          id: t.id ?? '',
          nome: t.function!.name!,
          // `arguments` vem como string JSON; a saida e DADO, nunca comando (SEC-061). Parse defensivo.
          argumentos: parseArgs(t.function?.arguments),
        }))
      return ok({
        texto: msg?.content ?? '',
        chamadasFerramenta,
        modelo,
        uso: uso(modelo, corpo.usage),
      })
    },

    async transcrever(entrada: TranscreverEntrada): Promise<Resultado<RespostaTranscrever, ErroProvedor>> {
      const modelo = modeloPadrao
      const b64 = Buffer.from(entrada.audio.bytes).toString('base64')
      const req: RequisicaoLlm = {
        headers: authHeader(entrada.credencial.revelar()),
        body: {
          model: modelo,
          provider: NO_TRAIN,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Transcreva o audio a seguir, apenas o texto falado.' },
                { type: 'input_audio', input_audio: { data: b64, format: formatoAudio(entrada.audio.mimeType) } },
              ],
            },
          ],
        },
      }
      let res: { status: number; corpo: unknown }
      try {
        res = await postar('/chat/completions', req)
      } catch (erro) {
        return falha(erro as ErroProvedor)
      }
      if (res.status < 200 || res.status >= 300) return falha(classificar(res.status, codigoDoErro(res.corpo)))
      const corpo = res.corpo as { model?: string; choices?: Array<{ message?: { content?: string | null } }>; usage?: UsoBruto }
      return ok({ texto: corpo.choices?.[0]?.message?.content ?? '', uso: uso(corpo.model ?? modelo, corpo.usage) })
    },

    async descreverImagem(entrada: DescreverImagemEntrada): Promise<Resultado<RespostaDescreverImagem, ErroProvedor>> {
      const modelo = modeloPadrao
      const b64 = Buffer.from(entrada.imagem.bytes).toString('base64')
      const req: RequisicaoLlm = {
        headers: authHeader(entrada.credencial.revelar()),
        body: {
          model: modelo,
          provider: NO_TRAIN,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: entrada.instrucao ?? 'Descreva a imagem em detalhes.' },
                { type: 'image_url', image_url: { url: `data:${entrada.imagem.mimeType};base64,${b64}` } },
              ],
            },
          ],
        },
      }
      let res: { status: number; corpo: unknown }
      try {
        res = await postar('/chat/completions', req)
      } catch (erro) {
        return falha(erro as ErroProvedor)
      }
      if (res.status < 200 || res.status >= 300) return falha(classificar(res.status, codigoDoErro(res.corpo)))
      const corpo = res.corpo as { model?: string; choices?: Array<{ message?: { content?: string | null } }>; usage?: UsoBruto }
      return ok({ descricao: corpo.choices?.[0]?.message?.content ?? '', uso: uso(corpo.model ?? modelo, corpo.usage) })
    },

    async embutir(entrada: EmbutirEntrada): Promise<Resultado<RespostaEmbutir, ErroProvedor>> {
      // Transporte: o adaptador honra a interface. A decisao do RAG.md (secao 4) e que embedding usa
      // a credencial da PLATAFORMA, nao a chave da loja; por isso o orquestrador NAO expoe embedding
      // pela chave da loja. Este metodo existe so para o contrato e para um futuro cliente de plataforma.
      const modelo = entrada.modelo ?? modeloPadrao
      const req: RequisicaoLlm = {
        headers: authHeader(entrada.credencial.revelar()),
        body: { model: modelo, provider: NO_TRAIN, input: entrada.textos },
      }
      let res: { status: number; corpo: unknown }
      try {
        res = await postar('/embeddings', req)
      } catch (erro) {
        return falha(erro as ErroProvedor)
      }
      if (res.status < 200 || res.status >= 300) return falha(classificar(res.status, codigoDoErro(res.corpo)))
      const corpo = res.corpo as { model?: string; data?: Array<{ embedding?: number[] }>; usage?: UsoBruto }
      const vetores = (corpo.data ?? []).map((d) => d.embedding ?? [])
      return ok({ vetores, uso: uso(corpo.model ?? modelo, corpo.usage) })
    },
  }
}

/** Parse defensivo de argumentos de tool-call (string JSON -> objeto). A saida e DADO (SEC-061). */
function parseArgs(bruto: string | undefined): Record<string, unknown> {
  if (!bruto) return {}
  try {
    const v = JSON.parse(bruto)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Mapeia o mimeType de audio para o formato que o provedor espera (ex.: 'ogg', 'mp3', 'wav'). */
function formatoAudio(mimeType: string): string {
  const m = /audio\/([a-z0-9.+-]+)/i.exec(mimeType)
  return (m?.[1] ?? 'ogg').replace('x-', '')
}
