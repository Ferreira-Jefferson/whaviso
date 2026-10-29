// Guards de rota. UX, nao seguranca: a seguranca real e a autorizacao na api (escopo de loja).
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useSessao } from '@/shared/auth'
import { ErrorState, Spinner } from '@/shared/ui'
import { ROTA_INICIAL } from './rotas'
import { useEhOperador } from './sonda_operador'

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-salvia">
      <Spinner className="size-6" />
    </div>
  )
}

/** Sem sessao: vai para /entrar (URL limpa; depois de logar a home e a rota inicial). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useSessao()
  if (status === 'carregando') return <Splash />
  if (status === 'deslogado') return <Navigate to="/entrar" replace />
  return <>{children}</>
}

/** Com sessao: a pagina de entrada (e a landing) nunca aparecem; vai para a rota inicial. */
export function RedirectSeLogado({ children }: { children: ReactNode }) {
  const { status } = useSessao()
  if (status === 'logado') return <Navigate to={ROTA_INICIAL} replace />
  if (status === 'carregando') return <Splash />
  return <>{children}</>
}

/** Console do operador: sem sessao vai para /entrar; logado mas sem acesso volta a rota da loja. */
export function RequireOperador({ children }: { children: ReactNode }) {
  const { status } = useSessao()
  const { data, isPending, isError, refetch } = useEhOperador()
  if (status === 'carregando') return <Splash />
  if (status === 'deslogado') return <Navigate to="/entrar" replace />
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
