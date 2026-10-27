// Camada de dados do modulo plataforma_clientes (console do OPERADOR Whaviso): restaurantes como
// clientes. Metadado e saude agregada; nunca conteudo de loja nem contato (SEC-003). Rotas de
// operador: sem x-loja-id (`semLoja`). Este modulo NUNCA importa outro modulo.
// Raiz de cache ['plataforma_clientes'].
//   GET   /v1/plataforma-clientes/contas?busca&situacao&cursor&limite   lista paginada por cursor
//   GET   /v1/plataforma-clientes/contas/:id                            ficha
//   GET   /v1/plataforma-clientes/operadores                            equipe (so admin)
//   POST  /v1/plataforma-clientes/operadores                            vincula user existente (admin)
//   PATCH /v1/plataforma-clientes/operadores/:id                        papel/ativo (admin)
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  OperadorDTO,
  OperadorListaSaida,
  PlataformaContaFicha,
  PlataformaContaPagina,
  type OperadorConvite,
  type OperadorPatch,
  type PlataformaSituacaoConta,
} from '@/shared/contracts/_generated/plataforma_clientes'

export const RAIZ = 'plataforma_clientes'

type OperadorLista = z.infer<typeof OperadorListaSaida>

export interface FiltroContas {
  /** Minimo 2 caracteres (o backend recusa menos); o chamador so passa quando valido. */
  busca?: string
  situacao?: PlataformaSituacaoConta
}

const LIMITE_PAGINA = 20

export function useContas(filtro: FiltroContas) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'contas', filtro.busca ?? '', filtro.situacao ?? ''],
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<PlataformaContaPagina>('/plataforma-clientes/contas', {
        query: { cursor: pageParam, limite: LIMITE_PAGINA, busca: filtro.busca, situacao: filtro.situacao },
        schema: PlataformaContaPagina,
        signal,
        semLoja: true,
      }),
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  })
}

/** Ficha da conta; so busca com um id selecionado. */
export function useFichaConta(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'ficha', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<PlataformaContaFicha>(`/plataforma-clientes/contas/${id}`, {
        schema: PlataformaContaFicha,
        signal,
        semLoja: true,
      }),
  })
}

export function useOperadores() {
  return useQuery({
    queryKey: [RAIZ, 'operadores'],
    queryFn: ({ signal }) =>
      apiClient.get<OperadorLista>('/plataforma-clientes/operadores', {
        schema: OperadorListaSaida,
        signal,
        semLoja: true,
      }),
  })
}

export function useConvidarOperador() {
  const qc = useQueryClient()
  return useMutation<OperadorDTO, Error, OperadorConvite>({
    mutationFn: (body) =>
      apiClient.post<OperadorDTO>('/plataforma-clientes/operadores', { body, schema: OperadorDTO, semLoja: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'operadores'] }),
  })
}

export function useAtualizarOperador() {
  const qc = useQueryClient()
  return useMutation<OperadorDTO, Error, { id: string; patch: OperadorPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<OperadorDTO>(`/plataforma-clientes/operadores/${id}`, {
        body: patch,
        schema: OperadorDTO,
        semLoja: true,
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'operadores'] }),
  })
}
