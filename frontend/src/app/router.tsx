import { createBrowserRouter, RouterProvider } from 'react-router'
import { ErrorBoundary } from './ErrorBoundary'
import { rotas } from './arvore'

const router = createBrowserRouter(rotas)

export function AppRouter() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  )
}
