// Instancia padrao do app: liga o api_client ao supabase (so token) e ao logout.
import { getAccessToken, renovarSessao, signOut } from '../supabase'
import { criarApiClient } from './client'

export const apiClient = criarApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '',
  getToken: getAccessToken,
  renovarToken: renovarSessao,
  aoSessaoExpirada: () => {
    void signOut()
  },
})
