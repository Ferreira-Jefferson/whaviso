// Guards de rota. A api e a autoridade do acesso (nega dado com 403); estes guards decidem o que
// RENDERIZAR. RequireAcessoApp e um gate de entrada: quem nao tem acesso nenhum nunca atravessa o
// shell autenticado (reduz superficie de phishing/engenharia social), volta para /entrar.
import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useSessao } from '@/shared/auth'
import { ErrorState, Spinner } from '@/shared/ui'
import { ROTA_INICIAL } from './rotas'
import { useEhOperador } from './sonda_operador'
import { marcarBarrado, useDecisaoAcesso } from './sonda_acesso'

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

/**
 * Com sessao: a pagina de entrada (e a landing) nunca aparecem para quem tem acesso; vai para a rota
 * certa. Mas NAO redireciona so por estar logado: espera as sondas confirmarem o acesso (splash), e
 * so entao navega (ativo -> loja; operador -> console). Quem esta logado mas barrado e deslogado aqui
 * mesmo e PERMANECE em /entrar com a mensagem, sem piscar na rota protegida e voltar.
 */
export function RedirectSeLogado({ children }: { children: ReactNode }) {
  const { status, signOut } = useSessao()
  const decisao = useDecisaoAcesso()

  useEffect(() => {
    if (decisao.estado !== 'barrado') return
    marcarBarrado(decisao.motivo)
    void signOut()
  }, [decisao, signOut])

  if (status === 'deslogado') return <>{children}</>
  if (decisao.estado === 'ok') {
    return <Navigate to={decisao.operador && !decisao.ativo ? '/plataforma' : ROTA_INICIAL} replace />
  }
  // Logado: aguarda a decisao (carregando/erro/barrado-deslogando) sem redirecionar para rota protegida.
  return <Splash />
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
 * Gate de entrada do shell da loja. O critério é o ESTADO DE ATIVAÇÃO do e-mail (não "tem loja":
 * um cliente ativo cria a própria loja depois). Ativo entra (mesmo sem loja, cai em "criar primeira
 * loja"). Operador sem acesso de loja vai para o console. Pendente ou não liberado nunca entra:
 * desloga e volta para /entrar com a mensagem certa. Erro transitório nas sondas NÃO desloga.
 */
export function RequireAcessoApp({ children }: { children: ReactNode }) {
  const { status, signOut } = useSessao()
  const decisao = useDecisaoAcesso()

  // Barrado: marca o motivo (`pendente` tem mensagem própria; revogado/não cadastrado caem em "acesso
  // negado") e desloga; o RequireAuth externo leva a /entrar, onde a mensagem é exibida.
  useEffect(() => {
    if (decisao.estado !== 'barrado') return
    marcarBarrado(decisao.motivo)
    void signOut()
  }, [decisao, signOut])

  if (status === 'deslogado') return <Navigate to="/entrar" replace />
  if (decisao.estado === 'erro') {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 pt-8 md:px-8">
        <ErrorState aoTentarDeNovo={decisao.refetch} descricao="Não foi possível confirmar o seu acesso." />
      </div>
    )
  }
  if (decisao.estado === 'ok') {
    if (decisao.ativo) return <>{children}</>
    return <Navigate to="/plataforma" replace />
  }
  // Carregando ou barrado (o efeito acima está deslogando): segura num splash.
  return <Splash />
}
