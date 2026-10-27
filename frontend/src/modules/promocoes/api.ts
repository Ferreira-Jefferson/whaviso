// Camada de dados do modulo promocoes: cupons (percentual/fixo) e combos da loja.
// Estado de servidor via TanStack Query; dados so pelo api_client. Raiz de cache ['promocoes'].
// Este modulo NUNCA importa outro modulo (os itens do combo vem do endpoint REST do cardapio, via apiClient).
//
// Mapa REAL do backend (backend/apps/api/src/modules/promocoes):
//   GET|POST /v1/promocoes        lista por cursor (ativo, tipo) / cria
//   PATCH    /v1/promocoes/:id    edita (tipo, codigo e itens sao imutaveis); ativo=false desliga (sem DELETE)
//   POST     /v1/promocoes/validar  simula um cupom (200 com valido/motivo)
//   /aplicar e /usos: do fluxo de pedidos, nao usados aqui
//   GET      /v1/cardapio         arvore resolvida (nomes e precos dos itens do combo)
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import { CardapioResolvidoSaida } from '@/shared/contracts/_generated/cardapio'
import {
  PromocaoAtualizarEntrada,
  PromocaoCriarEntrada,
  PromocaoListaSaida,
  PromocaoSaida,
  PromocaoValidarEntrada,
  PromocaoValidarSaida,
  type PromocaoMotivo,
  type PromocaoTipo,
} from '@/shared/contracts/_generated/promocoes'

export const RAIZ = 'promocoes'

export type Promocao = z.infer<typeof PromocaoSaida>
export type PromocaoNova = z.input<typeof PromocaoCriarEntrada>
export type PromocaoEdicao = z.input<typeof PromocaoAtualizarEntrada>
export type ResultadoValidacao = z.infer<typeof PromocaoValidarSaida>
export type { PromocaoMotivo, PromocaoTipo }

export interface FiltroPromocoes {
  tipo: PromocaoTipo | null
  /** null = todas; true = so ativas; false = so desligadas. */
  ativo: boolean | null
}

export function usePromocoes(f: FiltroPromocoes) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'lista', f.tipo, f.ativo],
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<z.infer<typeof PromocaoListaSaida>>('/promocoes', {
        query: {
          tipo: f.tipo ?? undefined,
          ativo: f.ativo == null ? undefined : String(f.ativo),
          cursor: pageParam || undefined,
          limite: 20,
        },
        schema: PromocaoListaSaida,
        signal,
      }),
    initialPageParam: '' as string,
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

export function useCriarPromocao() {
  const invalidar = useInvalidar()
  return useMutation<Promocao, Error, PromocaoNova>({
    mutationFn: (body) => apiClient.post<Promocao>('/promocoes', { body: PromocaoCriarEntrada.parse(body), schema: PromocaoSaida }),
    onSettled: invalidar,
  })
}

export function useAtualizarPromocao() {
  const invalidar = useInvalidar()
  return useMutation<Promocao, Error, { id: string; body: PromocaoEdicao }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<Promocao>(`/promocoes/${id}`, { body: PromocaoAtualizarEntrada.parse(body), schema: PromocaoSaida }),
    onSettled: invalidar,
  })
}

export function useValidarCupom() {
  return useMutation<ResultadoValidacao, Error, z.input<typeof PromocaoValidarEntrada>>({
    mutationFn: (body) =>
      apiClient.post<ResultadoValidacao>('/promocoes/validar', {
        body: PromocaoValidarEntrada.parse(body),
        schema: PromocaoValidarSaida,
      }),
  })
}

export interface ItemCardapio {
  id: string
  nome: string
  preco_centavos: number
}

/** Itens do cardapio (achatados) para montar combos. So leitura; reaproveita o endpoint do cardapio. */
export function useItensCardapio() {
  return useQuery({
    queryKey: [RAIZ, 'itens-cardapio'],
    queryFn: async ({ signal }): Promise<ItemCardapio[]> => {
      const r = await apiClient.get<z.infer<typeof CardapioResolvidoSaida>>('/cardapio', {
        schema: CardapioResolvidoSaida,
        signal,
      })
      return r.categorias.flatMap((c) => c.itens.map((i) => ({ id: i.id, nome: i.nome, preco_centavos: i.preco_centavos })))
    },
  })
}
