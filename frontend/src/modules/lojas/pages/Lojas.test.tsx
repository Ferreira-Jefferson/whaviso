// C3 (item 14): a tela de lojas nao mente sobre quem gerencia. O botao Editar so aparece onde a
// grade viva do servidor (GET /acessos/minhas) libera `lojas:gerir`; `convidado` nao aparece como gestor.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'

vi.mock('@/shared/supabase', () => ({
  getSession: async () => ({ access_token: 'tok-1', user: { id: 'user-1' } }),
  onAuthStateChange: () => () => undefined,
  getAccessToken: async () => 'tok-1',
  renovarSessao: async () => 'tok-2',
  signOut: vi.fn(async () => undefined),
}))

import { AuthProvider } from '@/shared/auth'
import { TenantProvider } from '@/shared/tenant'
import { ToastProvider } from '@/shared/ui'
import { criarQueryClient } from '@/app/query_client'
import Lojas from './Lojas'

const L_GERENTE = '11111111-1111-4111-8111-111111111111'
const L_CONVIDADO = '22222222-2222-4222-8222-222222222222'
const L_ATENDENTE = '33333333-3333-4333-8333-333333333333'

function loja(id: string, nome: string, papel: string) {
  return {
    id, nome, logo_url: null, cores: { primaria: '#b4532a' }, endereco: null, ativo: true, pausada: false,
    pausada_motivo: null, pausada_ate: null, capacidade_por_janela: null, capacidade_janela_minutos: 60, papel,
    aberta_agora: true, numeros_whatsapp: { total: 0, conectados: 0 },
    criado_em: '2026-01-01T00:00:00.000Z', atualizado_em: '2026-01-01T00:00:00.000Z',
  }
}
const LOJAS = [
  loja(L_GERENTE, 'Loja Gerente', 'gerente'),
  loja(L_CONVIDADO, 'Loja Convidado', 'convidado'),
  loja(L_ATENDENTE, 'Loja Atendente', 'atendente'),
]

describe('Lojas: Editar reflete a permissao real (lojas:gerir)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/v1/acessos/minhas')) {
          return new Response(
            JSON.stringify({
              por_loja: { [L_GERENTE]: ['cardapio:ver', 'lojas:gerir'], [L_CONVIDADO]: ['cardapio:ver'], [L_ATENDENTE]: ['pedidos:gerir'] },
            }),
            { status: 200 },
          )
        }
        if (url.includes('incluir_inativas')) return new Response(JSON.stringify({ itens: LOJAS }), { status: 200 })
        if (url.endsWith('/v1/lojas')) return new Response(JSON.stringify(LOJAS), { status: 200 })
        return new Response('{}', { status: 404 })
      }),
    )
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('so a loja com lojas:gerir mostra Editar; convidado e atendente nao', async () => {
    render(
      <QueryClientProvider client={criarQueryClient()}>
        <AuthProvider>
          <TenantProvider>
            <ToastProvider>
              <MemoryRouter>
                <Lojas />
              </MemoryRouter>
            </ToastProvider>
          </TenantProvider>
        </AuthProvider>
      </QueryClientProvider>,
    )
    await screen.findByText('Loja Convidado')
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Editar$/ })).toHaveLength(1))
    const card = (nome: string) => screen.getByText(nome).closest('li') as HTMLElement
    expect(card('Loja Gerente').querySelector('button')?.textContent).toContain('Editar')
    expect(card('Loja Convidado').textContent).not.toContain('Editar')
    expect(card('Loja Atendente').textContent).not.toContain('Editar')
  })
})
