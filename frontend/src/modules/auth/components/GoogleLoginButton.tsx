import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, type NavigateFunction } from 'react-router'
import { Button } from '@/shared/ui'
import { signInWithGoogleIdToken } from '@/shared/supabase'
import { mensagemDeErroAuth, nextSeguro } from '@/shared/auth'

// Login com Google via Google Identity Services (GIS): o consentimento roda na NOSSA
// origem e devolve um id_token (sem redirect pro supabase.co), que entregamos ao
// Supabase por signInWithIdToken. Assim o Google mostra o nosso app, não o supabase.co.
//
// Visual: o botão oficial do GIS não dá pra estilizar no padrão do app, então
// renderizamos o nosso Button (só visual) e sobrepomos o botão real do GIS invisível
// por cima, que captura o clique. Truque padrão pra casar id_token + design próprio.

interface RespostaCredencial {
  credential: string
}
interface GoogleIdApi {
  initialize(config: {
    client_id: string
    callback: (resposta: RespostaCredencial) => void
    nonce?: string
  }): void
  renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; text?: string; width?: number; locale?: string },
  ): void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } }
  }
}

const SRC_GSI = 'https://accounts.google.com/gsi/client'

// O GIS e um singleton por pagina: initialize() (e o nonce) valem para a pagina toda.
// Inicializamos UMA vez so; senao o GIS avisa "initialize() is called multiple times" a
// cada montagem do botao (ex.: voltar do passo do codigo para o passo 1). A callback e
// registrada uma vez e le a acao de login atual por este objeto de modulo, atualizado a
// cada render, entao nao precisamos re-inicializar quando navigate/next/onErro mudam.
let gisInicializado = false
const acaoLogin: {
  navigate: NavigateFunction | null
  next: string | null
  onErro: (msg: string) => void
} = { navigate: null, next: null, onErro: () => {} }

function carregarGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${SRC_GSI}"]`)
    if (existente) {
      existente.addEventListener('load', () => resolve())
      existente.addEventListener('error', () => reject(new Error('falha ao carregar GIS')))
      return
    }
    const script = document.createElement('script')
    script.src = SRC_GSI
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => reject(new Error('falha ao carregar GIS')))
    document.head.appendChild(script)
  })
}

// Nonce: o Google recebe o HASH sha256; o Supabase recebe o valor cru e confere.
async function gerarNonce(): Promise<{ cru: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const cru = btoa(String.fromCharCode(...bytes))
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cru))
  const hash = Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return { cru, hash }
}

function IconeGoogle() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

export function GoogleLoginButton({ onErro }: { onErro: (msg: string) => void }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = nextSeguro(params.get('next'))
  const moldura = useRef<HTMLDivElement>(null)
  const alvoGis = useRef<HTMLDivElement>(null)

  // Mantem a acao de login (compartilhada no modulo) sempre com os valores atuais, sem
  // dep array: roda a cada render. A callback unica do GIS le daqui no momento do clique.
  useEffect(() => {
    acaoLogin.navigate = navigate
    acaoLogin.next = next ?? null
    acaoLogin.onErro = onErro
  })

  useEffect(() => {
    let cancelado = false
    async function montar() {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
      if (!clientId) {
        onErro('Login com Google indisponível (configuração ausente).')
        return
      }
      try {
        await carregarGsi()
      } catch {
        onErro('Não foi possível carregar o Google. Verifique sua conexão.')
        return
      }
      if (cancelado || !window.google || !alvoGis.current) return

      // Inicializa o GIS uma vez por pagina; nas montagens seguintes so re-renderiza o botao.
      if (!gisInicializado) {
        const { cru, hash } = await gerarNonce()
        if (cancelado || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          nonce: hash,
          callback: async (resposta) => {
            const { error } = await signInWithGoogleIdToken(resposta.credential, cru)
            if (error) {
              acaoLogin.onErro(mensagemDeErroAuth(error))
              return
            }
            // O AuthProvider resolve o perfil; os guards levam à home/onboarding.
            acaoLogin.navigate?.(acaoLogin.next ?? '/app', { replace: true })
          },
        })
        gisInicializado = true
      }
      if (cancelado || !alvoGis.current) return
      alvoGis.current.innerHTML = ''
      // Largura = a da moldura (botão do app), p/ o clique cobrir todo o botão visível.
      const largura = Math.min(400, Math.round(moldura.current?.offsetWidth ?? 320))
      window.google.accounts.id.renderButton(alvoGis.current, { theme: 'outline', size: 'large', width: largura })
    }
    void montar()
    return () => {
      cancelado = true
    }
  }, [onErro])

  return (
    <div ref={moldura} className="relative w-full">
      {/* Visual no padrão do app; sem capturar clique (o GIS por cima é que captura). */}
      <Button type="button" variante="secondary" className="pointer-events-none w-full">
        <IconeGoogle />
        Continuar com Google
      </Button>
      {/* Botão real do GIS, invisível e por cima, recebe o clique. */}
      <div
        ref={alvoGis}
        aria-hidden
        className="absolute inset-0 z-10 overflow-hidden opacity-[0.001] [color-scheme:light]"
      />
    </div>
  )
}
