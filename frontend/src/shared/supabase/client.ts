// Client singleton do supabase-js: SOMENTE Auth.
// REGRA INEGOCIÁVEL (ver CLAUDE.md / plano): Supabase = Postgres + Auth apenas.
// É PROIBIDO usar `.from()` ou `functions.invoke()` aqui: todo dado trafega
// pela `api` REST (ver shared/api_client). RLS é deny-all para anon/authenticated.
//
// Login SEM e-mail/senha: método ÚNICO Google via Identity Services + signInWithIdToken
// (o consentimento roda na NOSSA origem, não redireciona pro supabase.co, então o Google
// mostra o nosso app). O login por WhatsApp/OTP foi removido (decisão 2026-10-29).
import { createClient, type Session } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  // Falha cedo e clara: sem auth o app não funciona.
  throw new Error(
    'Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_PUBLISHABLE_KEY no ambiente.',
  )
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // O login por Google usa signInWithIdToken (GIS devolve o id_token direto, sem
    // redirect), então nenhum fluxo depende de token na URL. Desligar reduz a superfície:
    // o cliente não processa tokens vindos no fragmento da URL.
    detectSessionInUrl: false,
  },
})

export type { Session }

// ---- Fachada de auth (a única superfície pública do Supabase no front) ----

/**
 * Faz login no Supabase com o `id_token` que o Google Identity Services devolve.
 * `nonce` é o valor CRU (o GIS recebeu o hash sha256 dele); o Supabase confere.
 * Sem redirect: o AuthProvider resolve o perfil pela mudança de sessão.
 */
export async function signInWithGoogleIdToken(idToken: string, nonce: string) {
  return supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

/** Renova a sessao (refresh token) e devolve o novo access token; null se falhar. */
export async function renovarSessao(): Promise<string | null> {
  const { data, error } = await supabase.auth.refreshSession()
  if (error) return null
  return data.session?.access_token ?? null
}

// Access token em memoria, mantido pelo onAuthStateChange (INITIAL_SESSION, SIGNED_IN,
// TOKEN_REFRESHED, SIGNED_OUT). Evita o getSession() (navigator.locks) antes de cada fetch:
// N queries paralelas disputavam o lock e serializavam.
let tokenMemoria: { token: string; expiraEm: number } | null = null

supabase.auth.onAuthStateChange((_event, session) => {
  tokenMemoria = session ? { token: session.access_token, expiraEm: (session.expires_at ?? 0) * 1000 } : null
})

export async function getAccessToken(): Promise<string | null> {
  // Folga de 10s: perto de expirar cai no plano B, que renova pela sessao.
  if (tokenMemoria && tokenMemoria.expiraEm - 10_000 > Date.now()) return tokenMemoria.token
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export function onAuthStateChange(
  callback: (session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return () => data.subscription.unsubscribe()
}
