// Porta de onboarding da Meta (Embedded Signup), kernel compartilhado de numero.
//
// Decisao (spec Notas): a api NAO importa o `zap`. O envio de mensagem continua exclusivo
// do `ClienteWhats` no `zap`; aqui ha uma porta minima e propria do fluxo de cadastro
// (trocar codigo, ler telefone, assinar webhook). Quando F2 definir um contrato comum,
// migrar a implementacao sem mudar as rotas.
//
// Este arquivo e o lar definitivo da porta: tanto as rotas da LOJA (`modules/numeros_whatsapp`)
// quanto as rotas do CONSOLE (`modules/plataforma_numeros`) consomem este kernel. Nenhum modulo
// e dono da tabela nem da porta: o kernel e.
//
// SEC-070 (SSRF): host FIXO `graph.facebook.com`, sem seguir redirect (`redirect: 'error'`),
// timeout curto. A URL e sempre construida sobre o host fixo e reconferida antes de sair.
//
// Versao do Graph: configuravel por `META_API_VERSION` (lida em config.ts, DEFAULT `v23.0`,
// alinhada ao zap). A versao NUNCA entra crua no path: e validada contra um formato fixo
// (`/^v\d+\.\d+$/`) para nao permitir injecao de segmento na URL.
//
// Passo `register` (opcional): o Embedded Signup pode exigir registrar o numero com um PIN de
// verificacao em duas etapas antes de enviar. O passo so existe quando ha um PIN valido
// (`META_REGISTER_PIN`, 6 digitos); sem ele o metodo `registrarNumero` fica AUSENTE (undefined)
// e o service pula o passo, preservando o comportamento atual. O register e sempre best-effort
// no service: falha dele nunca derruba a conexao do numero.

const HOST_META = 'graph.facebook.com'
const VERSAO_GRAPH_PADRAO = 'v23.0'
const FORMATO_VERSAO = /^v\d+\.\d+$/
const FORMATO_PIN = /^\d{6}$/
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
  /**
   * Registra o numero na Cloud API com o PIN de verificacao em duas etapas. OPCIONAL: so existe
   * quando ha um PIN configurado (`META_REGISTER_PIN`); ausente, o passo e pulado. Best-effort:
   * o service envolve a chamada em try/catch e segue mesmo se falhar (numero ja registrado, etc.).
   */
  registrarNumero?(token: string, phoneNumberId: string): Promise<void>
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
  /** Versao do Graph (ex.: `v23.0`); padrao `v23.0`. Validada contra `/^v\d+\.\d+$/`. */
  versao?: string
  /** PIN (6 digitos) do passo `register`. Presente e valido => expoe `registrarNumero`. */
  registerPin?: string
  /** Injetavel p/ teste; padrao: fetch global. */
  fetchFn?: FetchFn
  timeoutMs?: number
}

/** Monta uma URL garantidamente no host fixo da Meta; rejeita qualquer outro host. */
function urlMeta(versao: string, caminho: string, params?: Record<string, string>): URL {
  const url = new URL(`https://${HOST_META}/${versao}/${caminho}`)
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

/** POST autenticado no host fixo; mesmo guarda de host/redirect/timeout do GET (SEC-070). */
async function postar(
  fetchFn: FetchFn,
  url: URL,
  token: string,
  timeoutMs: number,
  corpoJson?: unknown,
): Promise<void> {
  // Reconfere o host imediatamente antes de sair (defesa em profundidade, SEC-070).
  if (url.host !== HOST_META) throw new ErroMeta('host nao permitido')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  let body: string | undefined
  if (corpoJson !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(corpoJson)
  }
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      redirect: 'error', // nunca segue redirect (p/ 169.254.169.254, localhost, etc.)
      signal: ctrl.signal,
      headers,
      body,
    })
    if (!res.ok) throw new ErroMeta('resposta de erro da Meta')
  } catch (e) {
    if (e instanceof ErroMeta) throw e
    throw new ErroMeta('falha de transporte com a Meta')
  } finally {
    clearTimeout(t)
  }
}

/** Implementacao HTTP real contra `graph.facebook.com`. */
export function criarMetaOnboardingHttp(opcoes: OpcoesMetaHttp): MetaOnboarding {
  const fetchFn = opcoes.fetchFn ?? globalThis.fetch
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS
  const versao = opcoes.versao ?? VERSAO_GRAPH_PADRAO
  // Valida a versao antes de qualquer uso: ela entra no PATH da URL, nunca pode ser arbitraria.
  if (!FORMATO_VERSAO.test(versao)) throw new ErroMeta('versao do Graph invalida')
  // PIN opcional: se vier, tem que ser 6 digitos; invalido e rejeitado (nao vira register silencioso).
  const pin = opcoes.registerPin
  if (pin !== undefined && !FORMATO_PIN.test(pin)) throw new ErroMeta('PIN de registro invalido')

  const porta: MetaOnboarding = {
    async trocarCodigo(codigo) {
      const url = urlMeta(versao, 'oauth/access_token', {
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
      const url = urlMeta(versao, encodeURIComponent(phoneNumberId), {
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
      const url = urlMeta(versao, `${encodeURIComponent(wabaId)}/subscribed_apps`)
      await postar(fetchFn, url, token, timeoutMs)
    },
  }

  // So expoe o passo `register` quando ha PIN valido; sem ele o metodo fica ausente (undefined)
  // e o service pula o passo, preservando o comportamento atual.
  if (pin !== undefined) {
    porta.registrarNumero = async (token, phoneNumberId) => {
      const url = urlMeta(versao, `${encodeURIComponent(phoneNumberId)}/register`)
      await postar(fetchFn, url, token, timeoutMs, { messaging_product: 'whatsapp', pin })
    }
  }

  return porta
}

/** Normaliza para E.164 so com digitos e `+` inicial (remove espacos/hifens da Meta). */
function normalizarE164(bruto: string): string {
  const digitos = bruto.replace(/[^\d]/g, '')
  return `+${digitos}`
}
