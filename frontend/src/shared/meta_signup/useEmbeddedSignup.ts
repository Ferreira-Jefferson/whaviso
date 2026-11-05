// Embedded Signup da Meta (WhatsApp Cloud API) pelo popup oficial do SDK do Facebook.
// Substitui o formulario manual (code + phone_number_id + waba_id colados a mao): o popup
// devolve esses valores automaticamente. Modulo compartilhado (shared), importavel por qualquer
// modulo. O `code` e sensivel (SEC-020): NUNCA e logado aqui, nem tokens.
//
// Dois canais de retorno do fluxo, por isso o cuidado:
//   - o `code` chega no callback do FB.login (response.authResponse.code);
//   - o waba_id e o phone_number_id chegam por postMessage (evento WA_EMBEDDED_SIGNUP/FINISH),
//     com checagem ESTRITA de origem (apenas www/web.facebook.com).
import { useCallback, useState } from 'react'

// Identificadores PUBLICOS do app Whaviso na Meta (nao sao segredo; o segredo e so no backend).
// A versao do Graph deve bater com a META_API_VERSION do backend (ver frontend/.env.example).
const APP_ID = import.meta.env.VITE_META_APP_ID
const CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID
const GRAPH_VERSION = import.meta.env.VITE_META_GRAPH_VERSION

/** True so quando TODAS as VITE_META_* estao presentes; senao a UI cai no modo manual. */
export const META_CONFIGURADO = Boolean(APP_ID && CONFIG_ID && GRAPH_VERSION)

const SCRIPT_ID = 'facebook-jssdk'
const SDK_SRC = 'https://connect.facebook.net/pt_BR/sdk.js'
const ORIGENS_META = ['https://www.facebook.com', 'https://web.facebook.com']

export interface ResultadoSignup {
  codigo: string
  phone_number_id: string
  waba_id: string
}

// ---- Tipos minimos do SDK do Facebook (window.FB), sem `any` solto ----

interface FbLoginResponse {
  authResponse?: { code?: string } | null
  status?: string
}

interface FbLoginOptions {
  config_id: string
  response_type: 'code'
  override_default_response_type: boolean
  extras: {
    setup: Record<string, unknown>
    featureType: string
    sessionInfoVersion: string
  }
}

interface FbSdk {
  init(params: { appId: string; version: string; autoLogAppEvents?: boolean; xfbml?: boolean }): void
  login(callback: (response: FbLoginResponse) => void, options: FbLoginOptions): void
}

declare global {
  interface Window {
    FB?: FbSdk
    fbAsyncInit?: () => void
  }
}

// Formato das mensagens que o fluxo de Embedded Signup emite por postMessage.
interface SignupMessage {
  type?: string
  event?: string
  data?: {
    waba_id?: string
    phone_number_id?: string
    current_step?: string
    error_message?: string
  }
}

// Carrega o SDK uma unica vez, de forma preguicosa, e faz FB.init. Reaproveita a mesma Promise
// entre chamadas concorrentes; em caso de falha, zera para permitir nova tentativa.
let sdkPromise: Promise<FbSdk> | null = null

function iniciar(fb: FbSdk): FbSdk {
  fb.init({ appId: APP_ID, version: GRAPH_VERSION, autoLogAppEvents: true, xfbml: false })
  return fb
}

function carregarSdk(): Promise<FbSdk> {
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<FbSdk>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('A conexao pela Meta nao esta disponivel neste ambiente.'))
      return
    }
    if (window.FB) {
      resolve(iniciar(window.FB))
      return
    }
    window.fbAsyncInit = () => {
      if (!window.FB) {
        reject(new Error('Nao foi possivel iniciar o SDK da Meta.'))
        return
      }
      resolve(iniciar(window.FB))
    }
    // Se o script ja esta na pagina, o fbAsyncInit acima sera disparado quando carregar.
    if (document.getElementById(SCRIPT_ID)) return
    const js = document.createElement('script')
    js.id = SCRIPT_ID
    js.src = SDK_SRC
    js.async = true
    js.defer = true
    js.crossOrigin = 'anonymous'
    js.onerror = () => reject(new Error('Nao foi possivel carregar o SDK da Meta.'))
    document.head.appendChild(js)
  }).catch((erro: unknown) => {
    sdkPromise = null
    throw erro
  })
  return sdkPromise
}

/**
 * Hook do Embedded Signup. Retorna:
 *  - `disponivel`: false quando faltar qualquer VITE_META_* (a UI usa o modo manual).
 *  - `carregando`: true enquanto o SDK carrega e o popup esta aberto.
 *  - `lancar()`: abre o popup e resolve com { codigo, phone_number_id, waba_id }; rejeita com
 *    mensagem clara em cancelamento, erro da Meta ou se os identificadores nao vierem.
 */
export function useEmbeddedSignup() {
  const [carregando, setCarregando] = useState(false)

  const lancar = useCallback(async (): Promise<ResultadoSignup> => {
    if (!META_CONFIGURADO) {
      throw new Error('A conexao pela Meta nao esta configurada.')
    }
    setCarregando(true)
    try {
      const fb = await carregarSdk()
      return await new Promise<ResultadoSignup>((resolve, reject) => {
        // waba_id e phone_number_id chegam por postMessage, nao no retorno do FB.login.
        const infoSessao: { waba_id: string | null; phone_number_id: string | null } = {
          waba_id: null,
          phone_number_id: null,
        }

        function limpar() {
          window.removeEventListener('message', aoReceberMensagem)
        }

        function aoReceberMensagem(event: MessageEvent) {
          // Checagem estrita de origem: so aceitamos mensagens do proprio fluxo da Meta.
          if (!ORIGENS_META.includes(event.origin)) return
          if (typeof event.data !== 'string') return
          let payload: SignupMessage
          try {
            payload = JSON.parse(event.data) as SignupMessage
          } catch {
            return
          }
          if (payload.type !== 'WA_EMBEDDED_SIGNUP') return

          if (payload.event === 'FINISH') {
            infoSessao.waba_id = payload.data?.waba_id ?? null
            infoSessao.phone_number_id = payload.data?.phone_number_id ?? null
          } else if (payload.event === 'CANCEL') {
            limpar()
            reject(new Error('Conexao cancelada antes de concluir.'))
          } else if (payload.event === 'ERROR') {
            limpar()
            reject(new Error('A Meta retornou um erro durante a conexao. Tente de novo.'))
          }
        }

        window.addEventListener('message', aoReceberMensagem)

        fb.login(
          (response) => {
            const codigo = response?.authResponse?.code
            if (!codigo) {
              limpar()
              reject(new Error('Nao foi possivel concluir o login com a Meta.'))
              return
            }
            if (!infoSessao.phone_number_id || !infoSessao.waba_id) {
              limpar()
              reject(
                new Error(
                  'A Meta nao retornou os identificadores do numero. Tente de novo ou use o cadastro manual.',
                ),
              )
              return
            }
            limpar()
            resolve({
              codigo,
              phone_number_id: infoSessao.phone_number_id,
              waba_id: infoSessao.waba_id,
            })
          },
          {
            config_id: CONFIG_ID,
            response_type: 'code',
            override_default_response_type: true,
            extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
          },
        )
      })
    } finally {
      setCarregando(false)
    }
  }, [])

  return { disponivel: META_CONFIGURADO, carregando, lancar }
}
