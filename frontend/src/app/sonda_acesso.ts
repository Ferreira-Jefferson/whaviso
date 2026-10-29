// Sonda de acesso de LOJA e sinal de "acesso negado", isolados em arquivo proprio (sem
// componentes) para os guards reusarem sem quebrar o fast-refresh, igual a sonda_operador.
import { useQuery } from '@tanstack/react-query'
import { useSessao } from '@/shared/auth'
import { ApiError, apiClient } from '@/shared/api_client'

/**
 * Sonda se o usuario logado tem acesso a ALGUMA loja (vinculo de membro). Usa GET /lojas, que
 * passa pelo `escopoLoja` do backend: 200 = tem vinculo; 403/401/404 = sem vinculo nenhum. Erro
 * transitorio propaga para o guard tratar (nunca deslogar "na duvida"). `semLoja` evita mandar um
 * x-loja-id salvo que poderia enviesar a resposta.
 */
export function useTemAcessoLoja() {
  const { status } = useSessao()
  return useQuery({
    queryKey: ['acesso', 'loja'],
    enabled: status === 'logado',
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        await apiClient.get('/lojas', { query: { incluir_inativas: 'false' }, semLoja: true, signal })
        return true
      } catch (e) {
        if (e instanceof ApiError && (e.isForbidden || e.isUnauthorized || e.isNotFound)) return false
        throw e
      }
    },
  })
}

// Sinal, por aba, de que o usuario foi barrado por falta de acesso: o guard marca antes de
// deslogar e a tela /entrar consome para exibir a mensagem. sessionStorage tolera bloqueio.
const CHAVE_ACESSO_NEGADO = 'whaviso:acesso-negado'

export function marcarAcessoNegado(): void {
  try {
    sessionStorage.setItem(CHAVE_ACESSO_NEGADO, '1')
  } catch {
    /* storage indisponivel: sem a mensagem, mas o bounce ainda acontece */
  }
}

/** Le e LIMPA o sinal (so vale para a proxima tela de /entrar). */
export function consumirAcessoNegado(): boolean {
  try {
    if (sessionStorage.getItem(CHAVE_ACESSO_NEGADO) === '1') {
      sessionStorage.removeItem(CHAVE_ACESSO_NEGADO)
      return true
    }
  } catch {
    /* storage indisponivel */
  }
  return false
}
