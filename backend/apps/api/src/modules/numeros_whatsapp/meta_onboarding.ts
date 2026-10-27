// Porta de onboarding da Meta (Embedded Signup) usada SO pelo cadastro do numero.
//
// Decisao (spec Notas): a api NAO importa o `zap`. O envio de mensagem continua exclusivo
// do `ClienteWhats` no `zap`; aqui ha uma porta minima e propria do fluxo de cadastro
// (trocar codigo, ler telefone, assinar webhook). Quando F2 definir um contrato comum,
// migrar a implementacao sem mudar as rotas.
//
// PROMOCAO: a spec aponta o lar definitivo em `apps/api/src/shared/meta_onboarding/**`.
// Enquanto o escopo desta tarefa e so o modulo, a porta vive aqui; promover depois.
//
// SEC-070 (SSRF): host FIXO `graph.facebook.com`, sem seguir redirect (`redirect: 'error'`),
// timeout curto. A URL e sempre construida sobre o host fixo e reconferida antes de sair.

const HOST_META = 'graph.facebook.com'
const VERSAO_GRAPH = 'v21.0'
const TIMEOUT_PADRAO_MS = 8000

export interface TokenMeta {
  token: string
}
export interface TelefoneMeta {
  numero_e164: string
  verificado: boolean
}

/** Porta minima de cadastro. O `zap` tem a sua propria interface de envio. */
export interface MetaOnboarding {
  /** Troca o `code` do Embedded Signup por um token de acesso de negocio. */
  trocarCodigo(codigo: string): Promise<TokenMeta>
  /** Le o telefone (E.164) e o status de verificacao de um `phone_number_id`. */
  lerTelefone(token: string, phoneNumberId: string): Promise<TelefoneMeta>
  /** Assina a WABA no webhook da plataforma (idempotente do lado da Meta). */
  assinarWebhook(token: string, wabaId: string): Promise<void>
}

/** Erro do provedor; mensagem generica, nunca inclui token nem codigo. */
export class ErroMeta extends Error {
  constructor(message = 'falha na integracao com a Meta') {
    super(message)
    this.name = 'ErroMeta'
  }
}

// A porta e, por natureza, o cliente HTTP do onboarding (equivalente ao `ClienteWhats` do
// zap). Usa `globalThis.fetch` com host fixo + `redirect:'error'`; a trava de SSRF e o host
// allowlisted, nao a proibicao do transporte. Injetavel nos testes.
type FetchFn = typeof globalThis.fetch

export interface OpcoesMetaHttp {
  appId: string
  appSecret: string
  /** Injetavel p/ teste; padrao: fetch global. */
  fetchFn?: FetchFn
  timeoutMs?: number
}

/** Monta uma URL garantidamente no host fixo da Meta; rejeita qualquer outro host. */
function urlMeta(caminho: string, params?: Record<string, string>): URL {
  const url = new URL(`https://${HOST_META}/${VERSAO_GRAPH}/${caminho}`)
  if (url.host !== HOST_META) throw new ErroMeta('host nao permitido')
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v)
  return url
}

async function pedir(
  fetchFn: FetchFn,
  url: URL,
  token: string | null,
  timeoutMs: number,
): Promise<unknown> {
  // Reconfere o host imediatamente antes de sair (defesa em profundidade, SEC-070).
  if (url.host !== HOST_META) throw new ErroMeta('host nao permitido')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetchFn(url, {
      method: 'GET',
      redirect: 'error', // nunca segue redirect (p/ 169.254.169.254, localhost, etc.)
      signal: ctrl.signal,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
  } catch {
    // Timeout, abort, erro de rede OU redirect barrado por `redirect: 'error'`.
    throw new ErroMeta('falha de transporte com a Meta')
  } finally {
    clearTimeout(t)
  }
  if (!res.ok) throw new ErroMeta('resposta de erro da Meta')
  try {
    return (await res.json()) as unknown
  } catch {
    throw new ErroMeta('resposta invalida da Meta')
  }
}

/** Implementacao HTTP real contra `graph.facebook.com`. */
export function criarMetaOnboardingHttp(opcoes: OpcoesMetaHttp): MetaOnboarding {
  const fetchFn = opcoes.fetchFn ?? globalThis.fetch
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS
  return {
    async trocarCodigo(codigo) {
      const url = urlMeta('oauth/access_token', {
        client_id: opcoes.appId,
        client_secret: opcoes.appSecret,
        code: codigo,
      })
      const corpo = await pedir(fetchFn, url, null, timeoutMs)
      const token = (corpo as { access_token?: unknown }).access_token
      if (typeof token !== 'string' || token.length === 0) {
        throw new ErroMeta('token ausente na resposta da Meta')
      }
      return { token }
    },
    async lerTelefone(token, phoneNumberId) {
      const url = urlMeta(encodeURIComponent(phoneNumberId), {
        fields: 'display_phone_number,verified_name,code_verification_status',
      })
      const corpo = await pedir(fetchFn, url, token, timeoutMs)
      const c = corpo as { display_phone_number?: unknown; code_verification_status?: unknown }
      if (typeof c.display_phone_number !== 'string') {
        throw new ErroMeta('telefone ausente na resposta da Meta')
      }
      return {
        numero_e164: normalizarE164(c.display_phone_number),
        verificado: c.code_verification_status === 'VERIFIED',
      }
    },
    async assinarWebhook(token, wabaId) {
      const url = urlMeta(`${encodeURIComponent(wabaId)}/subscribed_apps`)
      // POST de assinatura; mesmo guarda de host/redirect/timeout.
      if (url.host !== HOST_META) throw new ErroMeta('host nao permitido')
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetchFn(url, {
          method: 'POST',
          redirect: 'error',
          signal: ctrl.signal,
          headers: { authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new ErroMeta('falha ao assinar o webhook')
      } catch (e) {
        if (e instanceof ErroMeta) throw e
        throw new ErroMeta('falha de transporte com a Meta')
      } finally {
        clearTimeout(t)
      }
    },
  }
}

/** Normaliza para E.164 so com digitos e `+` inicial (remove espacos/hifens da Meta). */
function normalizarE164(bruto: string): string {
  const digitos = bruto.replace(/[^\d]/g, '')
  return `+${digitos}`
}
