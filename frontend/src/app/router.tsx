// Router declarativo (react-router 7) com TODAS as rotas do plano (seção 4).
// Fase 0: páginas placeholder; guards mockados (deixam passar).
import { Suspense } from 'react'
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  Navigate,
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
  RedirectSeLogado,
} from './guards'

import { PoliticaPrivacidadePage, TermosUsoPage } from '@/modules/legal'
import { LoginPage, OnboardingPage } from '@/modules/auth'
import { NotificacoesPage } from '@/modules/notificacoes'
import { CategoriasPage } from '@/modules/categorias'
import { ContaPage } from '@/modules/conta'
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

const router = createBrowserRouter([
  {
    element: <ComSuspense />,
    errorElement: <AppError />,
    children: [
      // TODO(pivo): rota '/' (landing) removida; reconstruir a landing do produto novo.
      { path: '/', element: <RedirectSeLogado><Navigate to="/entrar" replace /></RedirectSeLogado> },

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

      // ---- ÁREA DO USUÁRIO ----
      // TODO(pivo): rotas do app do restaurante (pedidos, cardápio, etc.) ainda não existem.
      {
        path: '/app',
        element: (
          <RequireRole role="user">
            <AppShell />
          </RequireRole>
        ),
        children: [
          { index: true, element: <NotificacoesPage /> },
          { path: 'categorias', element: <CategoriasPage /> },
          { path: 'notificacoes', element: <NotificacoesPage /> },
          { path: 'conta', element: <ContaPage /> },
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
