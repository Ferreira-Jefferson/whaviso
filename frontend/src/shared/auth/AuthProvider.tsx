// AuthProvider: fonte única de { session, profile, role, status }.
// Resolve a sessão do Supabase no mount e em onAuthStateChange; o `role` vem
// SEMPRE de GET /v1/perfil (o Custom Access Token Hook com `user_role` pode não
// estar configurado, então o claim do JWT é só uma dica opcional). Sessão válida
// mas perfil incompleto/ausente → precisaOnboarding=true.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  getSession,
  onAuthStateChange,
  signOut as supabaseSignOut,
  type Session,
} from '../supabase'
import { type Perfil, type RoleUsuario } from '../contracts'
import { ApiError } from '../api_client'
import { AuthContext, type AuthState, type AuthStatus } from './context'
import { buscarPerfil, perfilIncompleto } from './perfil'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Perfil | null>(null)
  const [status, setStatus] = useState<AuthStatus>('carregando')
  // Evita resolver perfil de uma sessão já trocada (corridas de async).
  const sessaoAtual = useRef<string | null>(null)
  // UID do usuário já resolvido. O Supabase reemite SIGNED_IN/TOKEN_REFRESHED ao
  // voltar o foco para a aba (autoRefreshToken + listener de visibilidade); se for
  // o MESMO usuário, NÃO re-resolvemos (nem voltamos a 'carregando'), senão os
  // guards trocam a página por um splash e a árvore inteira remonta, perdendo o
  // que estava sendo digitado num formulário.
  const usuarioResolvido = useRef<string | null>(null)

  // Resolve o perfil para a sessão dada; sem sessão → estado deslogado.
  // `forcar` ignora o curto-circuito de "mesmo usuário" (usado por recarregarPerfil,
  // ex.: após o onboarding, quando o perfil de fato mudou).
  const resolver = useCallback(async (s: Session | null, forcar = false) => {
    const marca = s?.access_token ?? null
    const uid = s?.user?.id ?? null
    sessaoAtual.current = marca

    // Mesmo usuário já resolvido e sem recarga explícita: só atualiza a sessão (o
    // token pode ter sido renovado) e sai, sem tocar em status/profile. É isto que
    // evita o "recarregar e perder o texto" ao voltar para a aba.
    if (!forcar && uid && uid === usuarioResolvido.current) {
      setSession(s)
      return
    }

    setSession(s)

    if (!s) {
      usuarioResolvido.current = null
      setProfile(null)
      setStatus('deslogado')
      return
    }

    setStatus('carregando')
    try {
      const perfil = await buscarPerfil()
      if (sessaoAtual.current !== marca) return // sessão mudou no meio
      usuarioResolvido.current = uid
      setProfile(perfil)
      setStatus('logado')
    } catch (err) {
      if (sessaoAtual.current !== marca) return
      // 401 = sessão inválida/expirada apesar do token local → trate como deslogado.
      if (err instanceof ApiError && err.isUnauthorized) {
        usuarioResolvido.current = null
        setProfile(null)
        setStatus('deslogado')
        return
      }
      // Outras falhas (rede/api fora): mantém logado sem perfil → onboarding/retry.
      // Não marca usuarioResolvido (o perfil não veio), para reprocessar na próxima.
      setProfile(null)
      setStatus('logado')
    }
  }, [])

  useEffect(() => {
    let ativo = true
    void getSession().then((s) => {
      if (ativo) void resolver(s)
    })
    const unsub = onAuthStateChange((s) => {
      void resolver(s)
    })
    return () => {
      ativo = false
      unsub()
    }
  }, [resolver])

  const recarregarPerfil = useCallback(async () => {
    const s = await getSession()
    await resolver(s, true) // força: pega o perfil novo (ex.: após o onboarding)
  }, [resolver])

  const value = useMemo<AuthState>(() => {
    const role: RoleUsuario | null = profile?.role ?? null
    const precisaOnboarding = status === 'logado' && perfilIncompleto(profile)
    return {
      session,
      profile,
      role,
      status,
      precisaOnboarding,
      recarregarPerfil,
      signOut: async () => {
        await supabaseSignOut()
      },
    }
  }, [session, profile, status, recarregarPerfil])

  return <AuthContext value={value}>{children}</AuthContext>
}
