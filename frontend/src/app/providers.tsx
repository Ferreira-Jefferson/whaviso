// Composição de providers: React Query + Auth + Router.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/shared/auth'
import { AppRouter } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dado permanece fresco pela navegação normal (sem refetch-on-mount ao voltar de
      // tela); o frescor real vem do poller de versão (shared/sync), não do staleTime
      // curto nem do foco de janela (por isso refetchOnWindowFocus desligado abaixo).
      staleTime: 300_000,
      gcTime: 1_800_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </QueryClientProvider>
  )
}
