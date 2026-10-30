// Camada de dados do modulo lojas: lista/perfil das lojas da conta (multi-tenant).
// Estado de servidor via TanStack Query; dados so pelo api_client. A raiz ['lojas'] e a
// MESMA raiz que o TenantProvider usa para o seletor do shell: invalida-la aqui faz o
// switcher do topo acompanhar criacao, renome, troca de cores e ativar/desativar.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  LojaListaSaida,
  LojaSaida,
  type LojaAtualizarEntrada,
  type LojaCriarEntrada,
  type LojaSaida as Loja,
} from '@/shared/contracts/_generated/lojas'
import { ContaSaida } from '@/shared/contracts/_generated/conta'

export const RAIZ = 'lojas'

/** GET /v1/lojas: todas as lojas no escopo do usuario (inativas so para o dono da conta). */
export function useLojas(incluirInativas: boolean) {
  return useQuery({
    queryKey: [RAIZ, 'gestao', { incluirInativas }],
    queryFn: ({ signal }) =>
      apiClient.get<{ itens: Loja[] }>('/lojas', {
        query: { incluir_inativas: incluirInativas ? 'true' : 'false' },
        schema: LojaListaSaida,
        signal,
      }),
    select: (d) => d.itens,
    // Catalogo estavel: mutacoes invalidam RAIZ na hora, entao 5 min corta refetch redundante.
    staleTime: 5 * 60_000,
  })
}

function invalidarLojas(qc: ReturnType<typeof useQueryClient>) {
  // Raiz ['lojas']: cobre a lista deste modulo E a lista do TenantProvider (seletor do shell).
  void qc.invalidateQueries({ queryKey: [RAIZ] })
}

/**
 * POST /v1/conta: bootstrap idempotente da conta do dono (cria conta + membro dono, ou devolve a
 * existente). Necessario ANTES de criar a 1a loja: POST /lojas exige o vinculo de dono. `semLoja`
 * porque ainda nao ha loja ativa para o header x-loja-id.
 */
export function useCriarConta() {
  return useMutation<z.infer<typeof ContaSaida>, Error, { nome: string }>({
    mutationFn: (body) => apiClient.post('/conta', { body, schema: ContaSaida, semLoja: true }),
  })
}

/** POST /v1/lojas: cria uma loja (so o dono da conta; a conta vem do vinculo, nunca do corpo). */
export function useCriarLoja() {
  const qc = useQueryClient()
  return useMutation<Loja, Error, LojaCriarEntrada>({
    mutationFn: (body) => apiClient.post<Loja>('/lojas', { body, schema: LojaSaida }),
    onSuccess: () => invalidarLojas(qc),
  })
}

/** PATCH /v1/lojas/:id: edita nome, endereco, horarios e area de entrega. */
export function useAtualizarLoja() {
  const qc = useQueryClient()
  return useMutation<Loja, Error, { id: string; body: LojaAtualizarEntrada }>({
    mutationFn: ({ id, body }) => apiClient.patch<Loja>(`/lojas/${id}`, { body, schema: LojaSaida }),
    onSuccess: () => invalidarLojas(qc),
  })
}

/** POST /v1/lojas/:id/desativar|reativar: liga/desliga a loja (so o dono da conta). */
export function useAlterarAtivo() {
  const qc = useQueryClient()
  return useMutation<Loja, Error, { id: string; ativar: boolean }>({
    mutationFn: ({ id, ativar }) =>
      apiClient.post<Loja>(`/lojas/${id}/${ativar ? 'reativar' : 'desativar'}`, { schema: LojaSaida }),
    onSuccess: () => invalidarLojas(qc),
  })
}

const MinhasPermissoesSaida = z.object({ por_loja: z.record(z.string(), z.array(z.string())) })

/**
 * GET /v1/acessos/minhas: o que o usuario logado pode em cada loja (grade viva do servidor).
 * Serve so para a UI nao mentir; o servidor decide cada acao. Enquanto carrega, nada e liberado.
 */
export function useMinhasPermissoes() {
  return useQuery({
    queryKey: [RAIZ, 'minhas-permissoes'],
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof MinhasPermissoesSaida>>('/acessos/minhas', { schema: MinhasPermissoesSaida, signal }),
    select: (d) => d.por_loja,
  })
}
