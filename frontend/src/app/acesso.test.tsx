// Gate de entrada do shell (RequireAcessoApp): quem nao tem acesso nenhum nunca atravessa o shell
// autenticado, e deslogado e volta para /entrar com aviso. Supabase e rede sao simulados.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'

// onAuthStateChange guarda a callback; signOut a dispara com null para deslogar de verdade.
// vi.hoisted: o factory do vi.mock e icado ao topo e nao pode fechar sobre vars normais.
const h = vi.hoisted(() => {
  let authCb: (s: unknown) => void = () => undefined
  return {
    setAuthCb: (cb: (s: unknown) => void) => {
      authCb = cb
    },
    signOutMock: vi.fn(async () => {
      authCb(null)
    }),
  }
})

vi.mock('@/shared/supabase', () => ({
  getSession: async () => ({ access_token: 'tok-1', user: { id: 'user-1' } }),
  onAuthStateChange: (cb: (s: unknown) => void) => {
    h.setAuthCb(cb)
    return () => undefined
  },
  getAccessToken: async () => 'tok-1',
  renovarSessao: async () => 'tok-2',
  signOut: h.signOutMock,
}))

import { AuthProvider } from '@/shared/auth'
import { RequireAcessoApp, RequireAuth } from './guards'
import { criarQueryClient } from './query_client'
import Entrar from './pages/Entrar'

type Resposta = Response

function montarFetch(mapa: (url: string) => Resposta) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => mapa(url)),
  )
}

function renderApp() {
  // MemoryRouter + Routes: navegacao pura em memoria (sem data router, que constroi Request e
  // esbarra no undici do Node com URL relativa).
  return render(
    <QueryClientProvider client={criarQueryClient()}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/pedidos']}>
          <Routes>
            <Route
              path="/pedidos"
              element={
                <RequireAuth>
                  <RequireAcessoApp>
                    <div>CONTEUDO DO SHELL</div>
                  </RequireAcessoApp>
                </RequireAuth>
              }
            />
            <Route path="/entrar" element={<Entrar />} />
            <Route path="/plataforma" element={<div>CONSOLE DA PLATAFORMA</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('RequireAcessoApp (gate de entrada)', () => {
  beforeEach(() => {
    h.signOutMock.mockClear()
    sessionStorage.clear()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  // Resposta padrao das sondas, sobreposta por `estado`/`operador` em cada caso.
  function sondas(estado: string, operadorOk = false) {
    return (url: string) => {
      if (url.includes('/v1/acessos-login/eu')) return new Response(JSON.stringify({ estado }), { status: 200 })
      if (url.includes('/v1/plataforma-painel/eu')) {
        return operadorOk
          ? new Response(JSON.stringify({ operador: true, papel: 'suporte' }), { status: 200 })
          : new Response('{"error":{}}', { status: 403 })
      }
      return new Response('{}', { status: 404 })
    }
  }

  it('nao cadastrado: desloga e volta para /entrar com "acesso nao permitido"', async () => {
    montarFetch(sondas('nao_cadastrado'))
    renderApp()
    await waitFor(() => expect(h.signOutMock).toHaveBeenCalled())
    await screen.findByText(/Acesso não permitido/i)
    expect(screen.queryByText('CONTEUDO DO SHELL')).toBeNull()
    expect(screen.getByRole('heading', { name: /Entrar no Whaviso/i })).toBeTruthy()
  })

  it('pendente: desloga e volta para /entrar com aviso de pagamento nao aprovado', async () => {
    montarFetch(sondas('pendente'))
    renderApp()
    await waitFor(() => expect(h.signOutMock).toHaveBeenCalled())
    await screen.findByText(/pagamento ainda não foi aprovado/i)
    expect(screen.queryByText('CONTEUDO DO SHELL')).toBeNull()
  })

  it('ativo: entra no shell (mesmo sem loja)', async () => {
    montarFetch(sondas('ativo'))
    renderApp()
    await screen.findByText('CONTEUDO DO SHELL')
    expect(h.signOutMock).not.toHaveBeenCalled()
  })

  it('operador sem acesso de loja: vai para o console, nao desloga', async () => {
    montarFetch(sondas('nao_cadastrado', true))
    renderApp()
    await screen.findByText('CONSOLE DA PLATAFORMA')
    expect(h.signOutMock).not.toHaveBeenCalled()
    expect(screen.queryByText('CONTEUDO DO SHELL')).toBeNull()
  })
})
