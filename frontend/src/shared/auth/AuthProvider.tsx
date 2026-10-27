// AuthProvider: fonte unica de { session, status }. O supabase-js serve SO para obter e
// renovar o JWT (SEC-010): nenhuma consulta a tabela. Quem a pessoa e, e a que lojas
// tem acesso, vem da api (shared/tenant), nunca do cliente.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSession, onAuthStateChange, signOut as supabaseSignOut, type Session } from '../supabase'
import { AuthContext, type AuthState, type AuthStatus } from './context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('carregando')

  useEffect(() => {
    let ativo = true
    void getSession()
      .then((s) => {
        if (!ativo) return
        setSession(s)
        setStatus(s ? 'logado' : 'deslogado')
      })
      .catch(() => {
        if (ativo) setStatus('deslogado')
      })
    const unsub = onAuthStateChange((s) => {
      // TOKEN_REFRESHED reemite a sessao do mesmo usuario: so troca o objeto, sem remontar a arvore.
      setSession(s)
      setStatus(s ? 'logado' : 'deslogado')
    })
    return () => {
      ativo = false
      unsub()
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabaseSignOut()
  }, [])

  const userId = session?.user?.id ?? null

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId,
      status,
      signOut,
      // Campos do legado de cobranca (perfil/papel vinham de GET /v1/perfil, que o produto
      // novo nao tem). Mantidos neutros so para o legado em modules/** seguir compilando.
      profile: null,
      role: null,
      jaEsteveLogado: false,
      precisaOnboarding: false,
      recarregarPerfil: async () => undefined,
    }),
    [session, userId, status, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
