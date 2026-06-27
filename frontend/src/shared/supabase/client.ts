// Client singleton do supabase-js: SOMENTE Auth.
// REGRA INEGOCIÁVEL (ver CLAUDE.md / plano): Supabase = Postgres + Auth apenas.
// É PROIBIDO usar `.from()` ou `functions.invoke()` aqui: todo dado trafega
// pela `api` REST (ver shared/api_client). RLS é deny-all para anon/authenticated.
//
// Login SEM e-mail/senha (decisão 2026-06-17): dois métodos, ambos no plano free e
// sem o SMTP limitado do Supabase:
//   1. Google via Identity Services + signInWithIdToken (o consentimento roda na NOSSA
//      origem, não redireciona pro supabase.co → o Google mostra o nosso app).
//   2. WhatsApp OTP (phone auth + Send SMS Hook; o nosso `zap` entrega o código via
//      Baileys, pelo nosso número). A entrega não depende da Meta.
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
    detectSessionInUrl: true,
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

/**
 * Envia um código de login pelo WhatsApp. O Supabase gera o OTP e o Send SMS
 * Hook o entrega pelo nosso número (via Baileys, no `zap`). `telefone` em E.164.
 */
export async function enviarCodigoWhatsapp(telefone: string) {
  return supabase.auth.signInWithOtp({ phone: telefone })
}

/** Verifica o código recebido no WhatsApp; em sucesso, abre a sessão. */
export async function verificarCodigoWhatsapp(telefone: string, codigo: string) {
  return supabase.auth.verifyOtp({ phone: telefone, token: codigo, type: 'sms' })
}

/**
 * Usuário já logado (Google ou phone) quer vincular/trocar o telefone: envia OTP
 * via Send SMS Hook para o novo número. O Supabase linka a identidade phone ao
 * usuário atual ao confirmar. Não cria conta nova.
 */
export async function atualizarTelefone(telefone: string) {
  return supabase.auth.updateUser({ phone: telefone })
}

/** Confirma o OTP de troca/vinculação de telefone (type phone_change). */
export async function verificarNovoTelefone(telefone: string, codigo: string) {
  return supabase.auth.verifyOtp({ phone: telefone, token: codigo, type: 'phone_change' })
}

/**
 * Troca a sessão phone-only pela sessão da conta Google após merge server-side.
 * Usa o hashed_token devolvido por `POST /auth/verificar-sessao` (magic link flow).
 */
export async function completarMesclagem(magicToken: string) {
  return supabase.auth.verifyOtp({ token_hash: magicToken, type: 'email' })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getAccessToken(): Promise<string | null> {
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
