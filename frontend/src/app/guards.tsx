// Guards de rota. UX, nao seguranca: a seguranca real e a autorizacao na api (escopo de loja).
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useLocation, useSearchParams } from 'react-router'
import { nextSeguro, useSessao } from '@/shared/auth'
import { ApiError, apiClient } from '@/shared/api_client'
import { ErrorState, Spinner } from '@/shared/ui'
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

/**
 * Sonda se o usuario logado e operador da plataforma. Nao ha endpoint de "quem sou eu" do
 * operador ainda: usamos o resumo do painel (rota de operador, sem x-loja-id) como sonda.
 * 403/401/404 = nao e operador; erro transitorio propaga para o guard tratar.
 */
function useEhOperador() {
  const { status } = useSessao()
  return useQuery({
    queryKey: ['operador', 'eu'],
    enabled: status === 'logado',
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        await apiClient.get('/plataforma-painel/resumo', { semLoja: true, signal })
        return true
      } catch (e) {
        if (e instanceof ApiError && (e.isForbidden || e.isUnauthorized || e.isNotFound)) return false
        throw e
      }
    },
  })
}

/** Console do operador: sem sessao vai para /entrar; logado mas sem acesso volta a rota da loja. */
export function RequireOperador({ children }: { children: ReactNode }) {
  const { status } = useSessao()
  const { data, isPending, isError, refetch } = useEhOperador()
  const location = useLocation()
  if (status === 'carregando') return <Splash />
  if (status === 'deslogado') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/entrar?next=${next}`} replace />
  }
  if (isPending) return <Splash />
  if (isError) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-8 md:px-8">
        <ErrorState aoTentarDeNovo={() => void refetch()} descricao="Não foi possível confirmar o acesso ao console." />
      </div>
    )
  }
  if (!data) return <Navigate to={ROTA_INICIAL} replace />
  return <>{children}</>
}
