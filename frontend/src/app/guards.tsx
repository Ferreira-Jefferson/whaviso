// Guards de rota. A api e a autoridade do acesso (nega dado com 403); estes guards decidem o que
// RENDERIZAR. RequireAcessoApp e um gate de entrada: quem nao tem acesso nenhum nunca atravessa o
// shell autenticado (reduz superficie de phishing/engenharia social), volta para /entrar.
import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useSessao } from '@/shared/auth'
import { ErrorState, Spinner } from '@/shared/ui'
import { ROTA_INICIAL } from './rotas'
import { useEhOperador } from './sonda_operador'
import { marcarAcessoNegado, useTemAcessoLoja } from './sonda_acesso'

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

/**
 * Gate de entrada do shell da loja. Logado mas sem acesso NENHUM (nem operador de plataforma, nem
 * vinculo com alguma loja) nunca entra: desloga e volta para /entrar com aviso. Operador sem loja
 * vai para o console. Erro transitorio nas sondas NAO desloga (mostra tentar de novo).
 */
export function RequireAcessoApp({ children }: { children: ReactNode }) {
  const { status, signOut } = useSessao()
  const op = useEhOperador()
  const loja = useTemAcessoLoja()

  // Negacao so e definitiva quando as duas sondas responderam (sem pendencia nem erro) e ambas
  // deram "sem acesso". Nesse caso marca o motivo e desloga; o RequireAuth externo leva a /entrar.
  const negado =
    status === 'logado' &&
    !op.isPending &&
    !loja.isPending &&
    !op.isError &&
    !loja.isError &&
    op.data === false &&
    loja.data === false

  useEffect(() => {
    if (!negado) return
    marcarAcessoNegado()
    void signOut()
  }, [negado, signOut])

  if (status === 'carregando') return <Splash />
  if (status === 'deslogado') return <Navigate to="/entrar" replace />
  if (op.isPending || loja.isPending) return <Splash />
  if (op.isError || loja.isError) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-8 md:px-8">
        <ErrorState
          aoTentarDeNovo={() => {
            void op.refetch()
            void loja.refetch()
          }}
          descricao="Não foi possível confirmar o seu acesso."
        />
      </div>
    )
  }
  if (loja.data === true) return <>{children}</>
  if (op.data === true) return <Navigate to="/plataforma" replace />
  // Sem acesso: o efeito acima esta deslogando; segura num splash ate o RequireAuth levar a /entrar.
  return <Splash />
}
