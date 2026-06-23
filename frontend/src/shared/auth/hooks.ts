import { useContext } from 'react'
import { AuthContext, type AuthState } from './context'
import type { Perfil, RoleUsuario } from '../contracts'

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>.')
  }
  return ctx
}

export function useSession() {
  return useAuth().session
}

export function useRole(): RoleUsuario | null {
  return useAuth().role
}

export function usePerfil(): Perfil | null {
  return useAuth().profile
}
