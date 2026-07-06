// Router declarativo (react-router 7) com TODAS as rotas do plano (seção 4).
// Fase 0: páginas placeholder; guards mockados (deixam passar).
import { Suspense } from 'react'
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  Navigate,
  useSearchParams,
} from 'react-router'
import { Spinner } from '@/shared/ui'
import { PublicLayout } from './layouts/PublicLayout'
import { LegalLayout } from './layouts/LegalLayout'
import { AppShell } from './layouts/AppShell'
import { ErrorBoundary } from './ErrorBoundary'
import { AppError } from './AppError'
import {
  RequireAuth,
  RequireRole,
  RequireVinculoDevedor,
  RedirectSeLogado,
} from './guards'

import { LandingPage } from '@/modules/landing'
import { PoliticaPrivacidadePage, TermosUsoPage } from '@/modules/legal'
import { LoginPage, OnboardingPage } from '@/modules/auth'
import { AcaoAvisoPage, SairLembretesPage } from '@/modules/aceite'
import { PainelPage } from '@/modules/painel'
import { NovoAvisoPage, DetalheAvisoPage } from '@/modules/avisos'
import { CreditosPage } from '@/modules/billing'
import { ContaPage } from '@/modules/conta'
import {
  MeusCombinadosPage,
  DetalheCombinadoPage,
  HistoricoPage,
  ContaDevedorPage,
} from '@/modules/devedor'
import {
  MetricasPage,
  UsuariosPage,
  TemplatesPage,
  DetalheMensagemPage,
  EnviosPage,
  ConexaoPage,
  CreditosAdminPage,
  DesignSystemPage,
} from '@/modules/admin'
import NotFound from './NotFound'

function Carregando() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-salvia">
      <Spinner className="size-6" />
    </div>
  )
}

function ComSuspense() {
  return (
    <Suspense fallback={<Carregando />}>
      <Outlet />
    </Suspense>
  )
}

// A lista de avisos foi consolidada no Painel (/app). A rota antiga /app/avisos vira
// um redirect que PRESERVA a query (papel/grupo/status/busca espelham os filtros do
// Painel), para não quebrar links e favoritos. /app/avisos/novo e /:id continuam.
function RedirectAvisos() {
  const [params] = useSearchParams()
  return <Navigate to={{ pathname: '/app', search: params.toString() }} replace />
}

const router = createBrowserRouter([
  {
    element: <ComSuspense />,
    errorElement: <AppError />,
    children: [
      // ---- LANDING (layout próprio de marketing, largo) ----
      // Logado: vai direto para a home do papel (cobre clique no logo, que aponta p/ "/").
      {
        path: '/',
        element: (
          <RedirectSeLogado>
            <LandingPage />
          </RedirectSeLogado>
        ),
      },

      // ---- LEGAL (LegalLayout: coluna de leitura larga) ----
      {
        element: <LegalLayout />,
        children: [
          { path: '/politica-de-privacidade', element: <PoliticaPrivacidadePage /> },
          { path: '/termos-de-uso', element: <TermosUsoPage /> },
        ],
      },

      // ---- PÚBLICO (PublicLayout: coluna estreita, mobile-first) ----
      {
        element: <PublicLayout />,
        children: [
          // Rotas de entrada: logado vai para a home do papel (respeita ?next=).
          {
            path: '/entrar',
            element: (
              <RedirectSeLogado>
                <LoginPage />
              </RedirectSeLogado>
            ),
          },
          // E5: a página pública /aceite/:token saiu; o aceite é 100% pelo WhatsApp.
          // /aviso/:token e /sair-lembretes/:token são de E7 (ações do devedor por link).
          { path: '/aviso/:token', element: <AcaoAvisoPage /> },
          { path: '/sair-lembretes/:token', element: <SairLembretesPage /> },
          // Onboarding: exige sessão, mas não um papel específico (e não força
          // o próprio redirect de onboarding, evita loop). Layout público.
          {
            path: '/onboarding',
            element: (
              <RequireAuth>
                <OnboardingPage />
              </RequireAuth>
            ),
          },
        ],
      },

      // ---- ÁREA DO USUÁRIO: avisos que ele gerencia (é cobrador_id) ----
      {
        path: '/app',
        element: (
          <RequireRole role="user">
            <AppShell />
          </RequireRole>
        ),
        children: [
          { index: true, element: <PainelPage /> },
          { path: 'avisos', element: <RedirectAvisos /> },
          { path: 'avisos/novo', element: <NovoAvisoPage /> },
          { path: 'avisos/:id', element: <DetalheAvisoPage /> },
          { path: 'creditos', element: <CreditosPage /> },
          { path: 'conta', element: <ContaPage /> },
        ],
      },

      // ---- ÁREA DO USUÁRIO: avisos em que foi convidado a pagar (é devedor_profile_id) ----
      {
        path: '/meus',
        element: (
          <RequireVinculoDevedor>
            <AppShell />
          </RequireVinculoDevedor>
        ),
        children: [
          { index: true, element: <MeusCombinadosPage /> },
          { path: 'combinados/:id', element: <DetalheCombinadoPage /> },
          { path: 'historico', element: <HistoricoPage /> },
          { path: 'conta', element: <ContaDevedorPage /> },
        ],
      },

      // ---- OWNER ----
      {
        path: '/admin',
        element: (
          <RequireRole role="owner">
            <AppShell />
          </RequireRole>
        ),
        children: [
          { index: true, element: <MetricasPage /> },
          { path: 'usuarios', element: <UsuariosPage /> },
          { path: 'templates', element: <TemplatesPage /> },
          { path: 'mensagens/:chave', element: <DetalheMensagemPage /> },
          { path: 'whatsapp', element: <ConexaoPage /> },
          { path: 'envios', element: <EnviosPage /> },
          { path: 'creditos', element: <CreditosAdminPage /> },
          { path: 'design', element: <DesignSystemPage /> },
        ],
      },

      // ---- 404 ----
      { path: '*', element: <NotFound /> },
    ],
  },
])

export function AppRouter() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}
