// Composicao de providers: Query > Auth > Toast > Tenant > Realtime > Router.
import { useEffect } from 'react'
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { AuthProvider, useSessao } from '@/shared/auth'
import { RealtimeProvider } from '@/shared/realtime'
import { TenantProvider } from '@/shared/tenant'
import { ToastProvider } from '@/shared/ui'
import { AppRouter } from './router'
import { criarQueryClient } from './query_client'

const queryClient = criarQueryClient()

/** Ao encerrar a sessao, nada do usuario anterior pode ficar em cache. */
function LimpaCacheAoSair() {
  const { status } = useSessao()
  const qc = useQueryClient()
  useEffect(() => {
    if (status === 'deslogado') qc.clear()
  }, [status, qc])
  return null
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LimpaCacheAoSair />
        <ToastProvider>
          <TenantProvider>
            <RealtimeProvider>
              <AppRouter />
            </RealtimeProvider>
          </TenantProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
