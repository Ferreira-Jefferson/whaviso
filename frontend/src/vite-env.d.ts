/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  // Client ID público do Google (login via Google Identity Services + signInWithIdToken).
  readonly VITE_GOOGLE_CLIENT_ID: string
  // Embedded Signup da Meta (WhatsApp Cloud API): identificadores públicos do app Whaviso usados
  // pelo popup de conexão de número. Podem vir vazios (aí a UI cai no modo manual).
  readonly VITE_META_APP_ID: string
  readonly VITE_META_CONFIG_ID: string
  readonly VITE_META_GRAPH_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
