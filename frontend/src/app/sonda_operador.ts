// Sonda de operador da plataforma, isolada em arquivo proprio para ser reusada pelos guards e
// pelos menus sem quebrar o fast-refresh (um arquivo que exporta componentes nao deve tambem
// exportar hook/constante, regra react-refresh/only-export-components).
import { useQuery } from '@tanstack/react-query'
import { useSessao } from '@/shared/auth'
import { ApiError, apiClient } from '@/shared/api_client'

/**
 * Sonda se o usuario logado e operador da plataforma. Usa o endpoint leve de identidade
 * do operador, gated so pelo vinculo ativo (fato, nao permissao editavel): desligar `painel:ver` na
 * grade de acessos nao expulsa ninguem do console. 403/401/404 = nao e operador; erro transitorio
 * propaga para o guard tratar.
 */
export function useEhOperador() {
  const { status } = useSessao()
  return useQuery({
    queryKey: ['operador', 'eu'],
    enabled: status === 'logado',
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        await apiClient.get('/plataforma-painel/eu', { semLoja: true, signal })
        return true
      } catch (e) {
        if (e instanceof ApiError && (e.isForbidden || e.isUnauthorized || e.isNotFound)) return false
        throw e
      }
    },
  })
}
