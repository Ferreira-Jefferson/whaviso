// Router do shell: rotas protegidas vem do registry (app/rotas.ts), 1 entrada por modulo.
import { lazy } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import { ComSuspense } from './ComSuspense'
import { AppShell } from './layouts/AppShell'
import { OperadorShell } from './layouts/OperadorShell'
import { LegalLayout } from './layouts/LegalLayout'
import { AppError } from './AppError'
import { RedirectSeLogado, RequireAuth, RequireOperador } from './guards'
import { ROTAS } from './rotas'
import { PaginaSlot } from './pages/PaginaSlot'
import Entrar from './pages/Entrar'
import NotFound from './NotFound'

// Console do operador da plataforma (equipe Whaviso): shell proprio, sem loja ativa.
const PlataformaPainel = lazy(() => import('@/modules/plataforma_painel'))
const PlataformaClientes = lazy(() => import('@/modules/plataforma_clientes'))
const PlataformaCobranca = lazy(() => import('@/modules/plataforma_cobranca'))
const PlataformaFunil = lazy(() => import('@/modules/plataforma_funil'))
// Paginas publicas de compliance ja em producao (politica e termos): seguem servidas pelo
// modulo legado ate o FR de compliance reassumir. Unica dependencia de modules/** do shell.
import { Landing } from '@/modules/landing'
import { PoliticaPrivacidadePage, TermosUsoPage } from '@/modules/legal'

export const rotas: RouteObject[] = [
  {
    element: <ComSuspense />,
    errorElement: <AppError />,
    children: [
      {
        path: '/',
        element: (
          <RedirectSeLogado>
            <Landing />
          </RedirectSeLogado>
        ),
      },
      {
        path: '/entrar',
        element: (
          <RedirectSeLogado>
            <Entrar />
          </RedirectSeLogado>
        ),
      },
      {
        element: <LegalLayout />,
        children: [
          { path: '/politica-de-privacidade', element: <PoliticaPrivacidadePage /> },
          { path: '/termos-de-uso', element: <TermosUsoPage /> },
        ],
      },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: ROTAS.map((r) => {
          const Pagina = r.pagina
          return { path: r.caminho, element: Pagina ? <Pagina /> : <PaginaSlot rota={r} /> }
        }),
      },
      {
        element: (
          <RequireAuth>
            <RequireOperador>
              <OperadorShell />
            </RequireOperador>
          </RequireAuth>
        ),
        children: [
          { path: '/plataforma', element: <Navigate to="/plataforma/painel" replace /> },
          { path: '/plataforma/painel', element: <PlataformaPainel /> },
          { path: '/plataforma/clientes', element: <PlataformaClientes /> },
          { path: '/plataforma/cobranca', element: <PlataformaCobranca /> },
          { path: '/plataforma/funil', element: <PlataformaFunil /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]

