// QA harness (dev-only): renderiza UMA tela real do painel dentro do AppShell real, mas com
// providers FAKES (auth logado como dono, loja ativa fake, realtime "ao vivo", sem Supabase) e
// o cache do TanStack Query alimentado pelo apiClient fake (ver vite.config: alias so no mode
// 'qa'). A tela vem por ?tela=<caminho>. NAO entra no build de producao.
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthContext, type AuthState } from '@/shared/auth/context'
import { TenantContext, type TenantState } from '@/shared/tenant/context'
import type { LojaResumo } from '@/shared/tenant'
import { RealtimeContext, type RealtimeState } from '@/shared/realtime/context'
import { ToastProvider } from '@/shared/ui'
import { AppShell } from '@/app/layouts/AppShell'
import { ROTAS, ROTA_INICIAL } from '@/app/rotas'
import { LOJAS_RESUMO } from './mocks'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
})

const auth: AuthState = {
  session: null,
  userId: '11111111-1111-4111-8111-000000008000',
  profile: null,
  role: 'owner',
  status: 'logado',
  jaEsteveLogado: true,
  precisaOnboarding: false,
  recarregarPerfil: async () => {},
  signOut: async () => {},
}

const lojas = LOJAS_RESUMO as LojaResumo[]
const tenant: TenantState = {
  lojas,
  lojaAtiva: lojas[0] ?? null,
  status: 'ok',
  erro: null,
  selecionarLoja: () => {},
  recarregar: () => {},
}

const realtime: RealtimeState = {
  estado: 'ao_vivo',
  registrar: () => () => {},
}

function telaInicial(): string {
  const tela = new URLSearchParams(window.location.search).get('tela')?.trim()
  if (tela && ROTAS.some((r) => r.caminho === tela)) return `/${tela}`
  return ROTA_INICIAL
}

export function Harness() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext value={auth}>
        <ToastProvider>
          <TenantContext value={tenant}>
            <RealtimeContext value={realtime}>
              <MemoryRouter initialEntries={[telaInicial()]}>
                <Suspense fallback={<div className="p-8 text-tinta-2">Carregando harness...</div>}>
                  <Routes>
                    <Route element={<AppShell />}>
                      {ROTAS.map((r) => {
                        const Pagina = r.pagina
                        return <Route key={r.caminho} path={r.caminho} element={Pagina ? <Pagina /> : <div />} />
                      })}
                    </Route>
                  </Routes>
                </Suspense>
              </MemoryRouter>
            </RealtimeContext>
          </TenantContext>
        </ToastProvider>
      </AuthContext>
    </QueryClientProvider>
  )
}
