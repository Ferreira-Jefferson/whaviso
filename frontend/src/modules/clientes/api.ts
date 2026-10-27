// Camada de dados do modulo clientes: chamadas a `api` REST + hooks TanStack Query.
// Estado de servidor 100% via React Query; dados so pelo api_client (nunca supabase.from).
// Este modulo NUNCA importa outro modulo. Raiz de cache ['clientes'].
//
// Mapa REAL do backend (backend/apps/api/src/modules/clientes/routes.ts):
//   GET   /v1/clientes            ✔ lista paginada por cursor { itens, proximoCursor } (query: q, cursor, limite)
//   GET   /v1/clientes/:id        ✔ detalhe { nome, telefone_mascarado, enderecos, resumo_pedidos }
//   PATCH /v1/clientes/:id        ✔ edita { nome } -> ClienteSaida
// PII: o telefone so sai MASCARADO do backend (telefone_mascarado). A revelacao em
// claro (POST /:id/telefone/revelar, so dono/gerente) NAO e usada nesta tela por decisao
// de privacidade: a operacao de atendimento se faz com o telefone mascarado.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  ClienteDetalheSaida,
  ClienteListaItem,
  ClienteListaSaida,
  ClienteSaida,
} from '@/shared/contracts/_generated/clientes'

export const RAIZ = 'clientes'

export type ClienteItem = z.infer<typeof ClienteListaItem>
export type ClienteDetalhe = z.infer<typeof ClienteDetalheSaida>
export type Cliente = z.infer<typeof ClienteSaida>
type ClienteLista = z.infer<typeof ClienteListaSaida>

const LIMITE = 20

/** GET /v1/clientes: lista paginada por cursor. `q` vazio lista todos (busca por nome/telefone). */
export function useClientes(q: string) {
  const termo = q.trim()
  return useInfiniteQuery({
    queryKey: [RAIZ, 'lista', termo],
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<ClienteLista>('/clientes', {
        query: { q: termo || undefined, cursor: pageParam || undefined, limite: LIMITE },
        schema: ClienteListaSaida,
        signal,
      }),
    initialPageParam: '' as string,
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  })
}

/** GET /v1/clientes/:id: detalhe (so quando ha um id selecionado). */
export function useClienteDetalhe(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'detalhe', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<ClienteDetalhe>(`/clientes/${id}`, { schema: ClienteDetalheSaida, signal }),
  })
}

/** PATCH /v1/clientes/:id: edita o nome. Invalida lista e detalhe. */
export function useAtualizarCliente() {
  const qc = useQueryClient()
  return useMutation<Cliente, Error, { id: string; nome: string }>({
    mutationFn: ({ id, nome }) =>
      apiClient.patch<Cliente>(`/clientes/${id}`, { body: { nome }, schema: ClienteSaida }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}
