import { QueryClient } from '@tanstack/react-query'
import { retryTransitorio } from '@/shared/api_client'

export function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // O frescor vem do realtime (invalidacao por evento); staleTime curto cobre o resto.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: retryTransitorio,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
  })
}
