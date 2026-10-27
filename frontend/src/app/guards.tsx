// Guards de rota. UX, nao seguranca: a seguranca real e a autorizacao na api (escopo de loja).
import type { ReactNode } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router'
import { nextSeguro, useSessao } from '@/shared/auth'
import { Spinner } from '@/shared/ui'
import { ROTA_INICIAL } from './rotas'

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-salvia">
      <Spinner className="size-6" />
    </div>
  )
}

/** Sem sessao: vai para /entrar?next=<rota atual>. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSessao()
  const location = useLocation()
  if (status === 'carregando') return <Splash />
  if (status === 'deslogado') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/entrar?next=${next}`} replace />
  }
  return <>{children}</>
}

/** Com sessao: a pagina de entrada nunca aparece; segue o `next` seguro ou a rota inicial. */
export function RedirectSeLogado({ children }: { children: ReactNode }) {
  const { status } = useSessao()
  const [params] = useSearchParams()
  if (status === 'logado') return <Navigate to={nextSeguro(params.get('next')) ?? ROTA_INICIAL} replace />
  if (status === 'carregando') return <Splash />
  return <>{children}</>
}
