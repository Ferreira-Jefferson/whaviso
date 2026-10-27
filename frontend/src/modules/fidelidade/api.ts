// Camada de dados do modulo fidelidade: programa (pontos ou cashback) e saldo por cliente.
// Estado de servidor via TanStack Query; dados so pelo api_client. Raiz de cache ['fidelidade'].
// Este modulo NUNCA importa outro modulo (a busca de cliente usa o endpoint REST de clientes via apiClient).
//
// Mapa REAL do backend (backend/apps/api/src/modules/fidelidade):
//   GET|PUT /v1/fidelidade/programa                  configuracao da loja (PUT: loja:gerir)
//   GET     /v1/fidelidade/clientes/:id/saldo        saldo derivado do livro
//   GET     /v1/fidelidade/clientes/:id/movimentos   extrato por cursor
//   POST    /v1/fidelidade/acumular|resgatar         NAO usados aqui: sao do fluxo de pedidos
//   GET     /v1/clientes?q=                          busca de cliente (contrato clientes; telefone so mascarado)
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import { ClienteListaSaida } from '@/shared/contracts/_generated/clientes'
import {
  MovimentosSaida,
  ProgramaEntrada,
  ProgramaSaida,
  SaldoSaida,
  type ModoFidelidadeTipo,
} from '@/shared/contracts/_generated/fidelidade'

export const RAIZ = 'fidelidade'

export type Programa = z.infer<typeof ProgramaSaida>
export type ProgramaForm = z.input<typeof ProgramaEntrada>
export type Saldo = z.infer<typeof SaldoSaida>
export type Movimento = z.infer<typeof MovimentosSaida>['itens'][number]
export type ClienteBusca = z.infer<typeof ClienteListaSaida>['itens'][number]
export type { ModoFidelidadeTipo }

export function usePrograma() {
  return useQuery({
    queryKey: [RAIZ, 'programa'],
    queryFn: ({ signal }) => apiClient.get<Programa>('/fidelidade/programa', { schema: ProgramaSaida, signal }),
  })
}

export function useSalvarPrograma() {
  const qc = useQueryClient()
  return useMutation<Programa, Error, ProgramaForm>({
    mutationFn: (body) =>
      apiClient.put<Programa>('/fidelidade/programa', { body: ProgramaEntrada.parse(body), schema: ProgramaSaida }),
    onSuccess: (programa) => {
      qc.setQueryData([RAIZ, 'programa'], programa)
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}

export function useSaldo(clienteId: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'saldo', clienteId],
    enabled: clienteId != null,
    queryFn: ({ signal }) =>
      apiClient.get<Saldo>(`/fidelidade/clientes/${clienteId}/saldo`, { schema: SaldoSaida, signal }),
  })
}

export function useMovimentos(clienteId: string | null) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'movimentos', clienteId],
    enabled: clienteId != null,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<z.infer<typeof MovimentosSaida>>(`/fidelidade/clientes/${clienteId}/movimentos`, {
        query: { cursor: pageParam || undefined, limite: 10 },
        schema: MovimentosSaida,
        signal,
      }),
    initialPageParam: '' as string,
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  })
}

/** Busca de cliente por nome ou telefone (o backend busca por hash; devolve telefone mascarado). */
export function useBuscaCliente(termo: string) {
  const q = termo.trim()
  return useQuery({
    queryKey: [RAIZ, 'busca-cliente', q],
    enabled: q.length >= 2,
    queryFn: ({ signal }) =>
      apiClient.get<z.infer<typeof ClienteListaSaida>>('/clientes', {
        query: { q, limite: 8 },
        schema: ClienteListaSaida,
        signal,
      }),
  })
}
