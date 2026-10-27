// Router do shell: rotas protegidas vem do registry (app/rotas.ts), 1 entrada por modulo.
import { Navigate, type RouteObject } from 'react-router'
import { ComSuspense } from './ComSuspense'
import { AppShell } from './layouts/AppShell'
import { LegalLayout } from './layouts/LegalLayout'
import { AppError } from './AppError'
import { RedirectSeLogado, RequireAuth } from './guards'
import { ROTAS, ROTA_INICIAL } from './rotas'
import { PaginaSlot } from './pages/PaginaSlot'
import Entrar from './pages/Entrar'
import NotFound from './NotFound'
// Paginas publicas de compliance ja em producao (politica e termos): seguem servidas pelo
// modulo legado ate o FR de compliance reassumir. Unica dependencia de modules/** do shell.
import { PoliticaPrivacidadePage, TermosUsoPage } from '@/modules/legal'

export const rotas: RouteObject[] = [
  {
    element: <ComSuspense />,
    errorElement: <AppError />,
    children: [
      { path: '/', element: <Navigate to={ROTA_INICIAL} replace /> },
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
      { path: '*', element: <NotFound /> },
    ],
  },
]

