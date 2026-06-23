import { createContext } from 'react'
import type { Session } from '../supabase'
import type { Perfil, RoleUsuario } from '../contracts'

// 'carregando' = resolvendo sessão/perfil; 'deslogado' = sem sessão;
// 'logado' = sessão válida (mesmo que o perfil ainda esteja incompleto).
export type AuthStatus = 'carregando' | 'deslogado' | 'logado'

export interface AuthState {
  session: Session | null
  /** Perfil real vindo de GET /v1/perfil (fonte de verdade do role). */
  profile: Perfil | null
  /** Papel do usuário, sempre do perfil; null enquanto carrega ou sem perfil. */
  role: RoleUsuario | null
  status: AuthStatus
  /** True quando há sessão mas o perfil está incompleto (precisa onboarding). */
  precisaOnboarding: boolean
  /** Refaz o fetch do perfil (após onboarding/edição de conta). */
  recarregarPerfil: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
