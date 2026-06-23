// Guards de rota REAIS (Fase 1). UX, não segurança (a real é RLS + autorização
// na `api`). Enquanto o perfil resolve, mostra um splash para não piscar telas.
// - RequireAuth: sem sessão → /entrar?next=<rota>.
// - RequireRole: papel errado → home do papel real (nunca "acesso negado" cru);
//   owner acessa tudo; perfil incompleto → /onboarding.
import type { ReactNode } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router'
import { useAuth, homeDoPapel, useTemVinculoDevedor } from '@/shared/auth'
import { Spinner } from '@/shared/ui'
import type { RoleUsuario } from '@/shared/contracts'

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-salvia">
      <Spinner className="size-6" />
    </div>
  )
}

function paraLogin(pathname: string, search: string) {
  const next = encodeURIComponent(pathname + search)
  return <Navigate to={`/entrar?next=${next}`} replace />
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'carregando') return <Splash />
  if (status === 'deslogado') return paraLogin(location.pathname, location.search)
  return <>{children}</>
}

/**
 * RedirectSeLogado: o inverso de RequireAuth, usado nas rotas de entrada
 * (landing/logo, /entrar). Se já há sessão, o
 * usuário nunca deve ver landing/login: vai direto para a home do papel (ou
 * /onboarding se o perfil estiver incompleto). Respeita `?next=` quando presente
 * (deep-link), senão cai na home do papel. Enquanto resolve (ou deslogado),
 * mostra a página pública normalmente, sem bloquear visitantes anônimos.
 */
export function RedirectSeLogado({ children }: { children: ReactNode }) {
  const { status, role, precisaOnboarding } = useAuth()
  const [params] = useSearchParams()

  if (status === 'logado') {
    if (precisaOnboarding) return <Navigate to="/onboarding" replace />
    const next = params.get('next')
    return <Navigate to={next || homeDoPapel(role)} replace />
  }
  // 'carregando' ou 'deslogado': renderiza a página pública (sem splash, para
  // não penalizar visitantes anônimos com um spinner na landing/login).
  return <>{children}</>
}

export function RequireRole({
  role,
  children,
}: {
  role: RoleUsuario | RoleUsuario[]
  children: ReactNode
}) {
  const { status, role: roleAtual, precisaOnboarding } = useAuth()
  const location = useLocation()

  if (status === 'carregando') return <Splash />
  if (status === 'deslogado') return paraLogin(location.pathname, location.search)

  // Sessão válida mas perfil incompleto/ausente → completar cadastro primeiro.
  if (precisaOnboarding) return <Navigate to="/onboarding" replace />

  const permitidos = Array.isArray(role) ? role : [role]
  // owner acessa tudo (ver plano seção 4).
  if (roleAtual === 'owner' || (roleAtual && permitidos.includes(roleAtual))) {
    return <>{children}</>
  }

  // papel errado → home do papel real (owner já retornou acima).
  return <Navigate to={homeDoPapel(roleAtual)} replace />
}

/**
 * RequireVinculoDevedor: guarda a área /meus por EXISTÊNCIA DE VÍNCULO de devedor,
 * nunca por role: "ser devedor" é relacional (avisos.devedor_profile_id == o
 * usuário), não identidade. owner acessa tudo; qualquer `user` entra se for devedor
 * em algum aviso. Guard é UX; a segurança real é RLS + autorização na `api`.
 */
export function RequireVinculoDevedor({ children }: { children: ReactNode }) {
  const { status, role, precisaOnboarding } = useAuth()
  const { isLoading, temVinculo } = useTemVinculoDevedor()
  const location = useLocation()

  if (status === 'carregando') return <Splash />
  if (status === 'deslogado') return paraLogin(location.pathname, location.search)
  if (precisaOnboarding) return <Navigate to="/onboarding" replace />

  // owner acessa tudo, sem checar vínculo.
  if (role === 'owner') return <>{children}</>

  // Demais (user): aguarda a checagem de vínculo.
  if (isLoading) return <Splash />
  if (temVinculo) return <>{children}</>

  // Sem vínculo de devedor → home do papel (nunca "acesso negado" cru).
  return <Navigate to={homeDoPapel(role)} replace />
}
