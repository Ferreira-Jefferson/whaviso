// Fumaca do shell: login mockado -> shell -> chamada autenticada -> troca de loja limpa cache
// -> evento realtime invalida query. Supabase e rede sao simulados; o resto e real.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'

vi.mock('@/shared/supabase', () => ({
  getSession: async () => ({ access_token: 'tok-1', user: { id: 'user-1' } }),
  onAuthStateChange: () => () => undefined,
  getAccessToken: async () => 'tok-1',
  renovarSessao: async () => 'tok-2',
  signOut: vi.fn(async () => undefined),
}))

import { apiClient } from '@/shared/api_client'
import { AuthProvider } from '@/shared/auth'
import { RealtimeProvider } from '@/shared/realtime'
import { TenantProvider } from '@/shared/tenant'
import { AppShell } from './layouts/AppShell'
import { criarQueryClient } from './query_client'

const L1 = '11111111-1111-4111-8111-111111111111'
const L2 = '22222222-2222-4222-8222-222222222222'
const PEDIDO = '33333333-3333-4333-8333-333333333333'

const LOJAS = [
  { id: L1, nome: 'Cantina do Ze', logo_url: null, cores: { primaria: '#b4532a' } },
  { id: L2, nome: 'Pizzaria Mondo', logo_url: null, cores: { primaria: '#3a4f8a' } },
]

function Pedidos() {
  const q = useQuery({ queryKey: ['pedidos'], queryFn: () => apiClient.get<{ n: number }>('/pedidos') })
  return <p data-testid="pedidos">{q.data ? `n=${q.data.n}` : 'carregando'}</p>
}

interface Chamada {
  url: string
  headers: Record<string, string>
}

describe('fluxo do shell', () => {
  const chamadas: Chamada[] = []
  let enviarSse: (t: string) => void = () => undefined
  let contador = 0

  beforeEach(() => {
    chamadas.length = 0
    contador = 0
    localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const headers = (init.headers ?? {}) as Record<string, string>
        chamadas.push({ url, headers })
        if (url.endsWith('/realtime/stream')) {
          const enc = new TextEncoder()
          const body = new ReadableStream<Uint8Array>({
            start(c) {
              enviarSse = (t) => c.enqueue(enc.encode(t))
            },
          })
          return new Response(body, { status: 200 })
        }
        if (url.endsWith('/v1/lojas')) return new Response(JSON.stringify(LOJAS), { status: 200 })
        if (url.endsWith('/v1/pedidos')) {
          contador += 1
          return new Response(JSON.stringify({ n: contador }), { status: 200 })
        }
        return new Response('{}', { status: 404 })
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    document.documentElement.removeAttribute('style')
  })

  it('login mockado, chamada autenticada, troca de loja e realtime', async () => {
    const router = createMemoryRouter(
      [{ element: <AppShell />, children: [{ path: 'pedidos', element: <Pedidos /> }] }],
      { initialEntries: ['/pedidos'] },
    )
    render(
      <QueryClientProvider client={criarQueryClient()}>
        <AuthProvider>
          <TenantProvider>
            <RealtimeProvider urlBase="http://api.test">
              <RouterProvider router={router} />
            </RealtimeProvider>
          </TenantProvider>
        </AuthProvider>
      </QueryClientProvider>,
    )

    // shell com a loja ativa e o branding dela
    await screen.findByText('Cantina do Ze')
    expect(document.documentElement.style.getPropertyValue('--cor-primaria')).toBe('#b4532a')

    // chamada autenticada com Bearer e x-loja-id; loja nunca no corpo
    await waitFor(() => expect(screen.getByTestId('pedidos').textContent).toBe('n=1'))
    const ped = chamadas.find((c) => c.url.endsWith('/v1/pedidos'))
    expect(ped?.headers.Authorization).toBe('Bearer tok-1')
    expect(ped?.headers['x-loja-id']).toBe(L1)

    // realtime: conectou com a loja ativa e um evento invalida a query
    await waitFor(() => expect(chamadas.some((c) => c.url.endsWith('/realtime/stream'))).toBe(true))
    await waitFor(() => expect(screen.getByRole('status', { name: '' }).textContent).toContain('Ao vivo'))
    const payload = JSON.stringify({ pedido_id: PEDIDO, loja_id: L1, status: 'novo' })
    await act(async () => {
      enviarSse(`id: 1\nevent: pedido.atualizado\ndata: ${payload}\n\n`)
    })
    await waitFor(() => expect(screen.getByTestId('pedidos').textContent).toBe('n=2'))

    // troca de loja: limpa o cache e refaz a consulta com o novo escopo
    fireEvent.click(screen.getByRole('button', { name: /Cantina do Ze/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Pizzaria Mondo/ }))
    await screen.findByText('Pizzaria Mondo')
    await waitFor(() => expect(screen.getByTestId('pedidos').textContent).toBe('n=3'))
    const ultimo = chamadas.filter((c) => c.url.endsWith('/v1/pedidos')).at(-1)
    expect(ultimo?.headers['x-loja-id']).toBe(L2)
    expect(document.documentElement.style.getPropertyValue('--cor-primaria')).toBe('#3a4f8a')
    expect(localStorage.getItem('whaviso:loja-ativa:user-1')).toBe(L2)
  })

  it('funciona sem localStorage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const router = createMemoryRouter(
      [{ element: <AppShell />, children: [{ path: 'pedidos', element: <Pedidos /> }] }],
      { initialEntries: ['/pedidos'] },
    )
    render(
      <QueryClientProvider client={criarQueryClient()}>
        <AuthProvider>
          <TenantProvider>
            <RealtimeProvider urlBase="http://api.test">
              <RouterProvider router={router} />
            </RealtimeProvider>
          </TenantProvider>
        </AuthProvider>
      </QueryClientProvider>,
    )
    await screen.findByText('Cantina do Ze')
    vi.restoreAllMocks()
  })
})
