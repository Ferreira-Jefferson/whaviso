// Detecção de mudança por versão: complementa o cache longo do QueryClient (staleTime
// 5min, refetchOnWindowFocus desligado, ver app/providers.tsx). Em vez de recarregar
// painel/avisos por tempo ou foco de janela, o front consulta este carimbo barato em
// intervalo curto e só invalida as queries pesadas quando ele avança de verdade.
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import { syncVersaoResposta, type SyncVersaoResposta } from '@/shared/contracts'

const INTERVALO_POLL_MS = 30_000

export const syncKeys = {
  versao: ['sync', 'versao'] as const,
}

/**
 * GET /v1/sync/versao: barato (uma leitura de índice), por isso pode ficar em polling
 * curto e reagir ao foco de janela mesmo com o default global desligado (providers.tsx).
 */
export function useSyncVersao() {
  return useQuery({
    queryKey: syncKeys.versao,
    queryFn: ({ signal }) =>
      apiClient.get<SyncVersaoResposta>('/sync/versao', { schema: syncVersaoResposta, signal }),
    refetchInterval: INTERVALO_POLL_MS,
    refetchOnWindowFocus: true,
  })
}

/**
 * Montado uma vez, alto na árvore autenticada (AppShell): observa a versão e invalida
 * painel/avisos/meus só na TROCA de valor (nunca no primeiro carregamento nem a cada
 * poll sem mudança), para as telas se atualizarem sozinhas quando o servidor mudar algo
 * (zap confirma pagamento, devedor responde). O backend calcula a versão por
 * `cobrador_id OR devedor_profile_id` (ver api/modules/sync/repo.ts), então a invalidação
 * cobre também a área do devedor (`/meus`), não só painel/avisos do cobrador. Componente
 * headless, não renderiza nada.
 */
export function SyncVersaoWatcher() {
  const { data } = useSyncVersao()
  const queryClient = useQueryClient()
  const ultimaVersao = useRef<string | null>(null)

  useEffect(() => {
    if (!data) return
    const versaoAtual = data.versao.toISOString()
    if (ultimaVersao.current !== null && ultimaVersao.current !== versaoAtual) {
      void queryClient.invalidateQueries({ queryKey: ['painel'] })
      void queryClient.invalidateQueries({ queryKey: ['avisos'] })
      void queryClient.invalidateQueries({ queryKey: ['meus'] })
    }
    ultimaVersao.current = versaoAtual
  }, [data, queryClient])

  return null
}
