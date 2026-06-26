/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  // Client ID público do Google (login via Google Identity Services + signInWithIdToken).
  readonly VITE_GOOGLE_CLIENT_ID: string
  // Número do WhatsApp de vendas (só dígitos, com DDI) para o link de assinatura
  // via Pix. Sem ele, a tela de planos volta ao fluxo antigo (troca de cortesia).
  readonly VITE_WHATSAPP_VENDAS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
