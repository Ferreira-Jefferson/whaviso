// Camada de dados do modulo roteirizacao: sugestao automatica de corridas (por tempo de preparo
// + proximidade), aceite, otimizacao de ordem, geocodificacao de enderecos e configuracao.
// Estado de servidor via TanStack Query; dados so pelo api_client. Raiz de cache ['roteirizacao'].
// A loja vem do header x-loja-id, nunca do corpo. Duracoes em minutos, distancias em metros.
//
// Mapa REAL do backend (backend/apps/api/src/modules/roteirizacao, prefixo /v1/roteirizacao):
//   GET  /roteirizacao/config                  parametros da loja (defaults se nao configurou)
//   PUT  /roteirizacao/config                  patch parcial com upsert (dono/gerente)
//   POST /roteirizacao/geocodificar-pendentes  { limite } geocodifica enderecos sem coordenada
//   POST /roteirizacao/sugerir                 sugere corridas; NAO persiste
//   POST /roteirizacao/aceitar                 { pedido_ids, motoboy_id? } cria a corrida (sugerida)
//   POST /roteirizacao/reordenar               { pedido_ids } recalcula a ordem; NAO persiste
// Motoboys: o seletor leve vem de GET /v1/despacho/seletor (chamada HTTP, nao import do modulo).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import { CorridaSaida, MotoboySeletorListaSaida } from '@/shared/contracts/_generated/despacho'
import {
  DespachoConfigSaida,
  GeocodificarPendentesSaida,
  RoteirizacaoReordenarSaida,
  RoteirizacaoSugerirSaida,
  type CorridaSugerida,
  type DespachoConfigEntrada,
  type MotivoSemLocalizacao,
  type ParadaSugerida,
  type RoteirizacaoSugerirSaida as SugestaoDto,
  type SemLocalizacao,
} from '@/shared/contracts/_generated/roteirizacao'
import type { z } from 'zod'

export const RAIZ = 'roteirizacao'

export type Config = z.infer<typeof DespachoConfigSaida>
export type Sugestao = SugestaoDto
export type { CorridaSugerida, DespachoConfigEntrada, MotivoSemLocalizacao, ParadaSugerida, SemLocalizacao }
export type CorridaCriada = z.infer<typeof CorridaSaida>
export type ResultadoGeocodificacao = z.infer<typeof GeocodificarPendentesSaida>
export type OrdemRecalculada = z.infer<typeof RoteirizacaoReordenarSaida>
export interface MotoboyOpcao {
  id: string
  nome: string
}

/** GET /v1/roteirizacao/config. */
export function useConfig() {
  return useQuery({
    queryKey: [RAIZ, 'config'],
    queryFn: ({ signal }) => apiClient.get<Config>('/roteirizacao/config', { schema: DespachoConfigSaida, signal }),
  })
}

/** PUT /v1/roteirizacao/config. */
export function useSalvarConfig() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, DespachoConfigEntrada>({
    mutationFn: (body) => apiClient.put<unknown>('/roteirizacao/config', { body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'config'] }),
  })
}

/** GET /v1/despacho/seletor: motoboys ativos (id e nome) para escolher no aceite. */
export function useMotoboysAtivos() {
  return useQuery({
    queryKey: [RAIZ, 'motoboys-ativos'],
    queryFn: async ({ signal }) => {
      const r = await apiClient.get<z.infer<typeof MotoboySeletorListaSaida>>('/despacho/seletor', {
        schema: MotoboySeletorListaSaida,
        signal,
      })
      return r.itens.filter((m) => m.ativo).map<MotoboyOpcao>((m) => ({ id: m.id, nome: m.nome }))
    },
  })
}

export interface ParametrosSugestao {
  motoboysDisponiveis?: number
  geocodificar: boolean
}

/** POST /v1/roteirizacao/sugerir: nao persiste nada; o resultado vive no estado da tela. */
export function useSugerir() {
  return useMutation<Sugestao, Error, ParametrosSugestao>({
    mutationFn: ({ motoboysDisponiveis, geocodificar }) =>
      apiClient.post<Sugestao>('/roteirizacao/sugerir', {
        body: {
          geocodificar,
          ...(motoboysDisponiveis != null ? { motoboys_disponiveis: motoboysDisponiveis } : {}),
        },
        schema: RoteirizacaoSugerirSaida,
      }),
  })
}

/** POST /v1/roteirizacao/geocodificar-pendentes. */
export function useGeocodificarPendentes() {
  return useMutation<ResultadoGeocodificacao, Error, void>({
    mutationFn: () =>
      apiClient.post<ResultadoGeocodificacao>('/roteirizacao/geocodificar-pendentes', {
        body: { limite: 25 },
        schema: GeocodificarPendentesSaida,
      }),
  })
}

/** POST /v1/roteirizacao/reordenar: recalcula so a ordem da lista (nao persiste). */
export function useOtimizarOrdem() {
  return useMutation<OrdemRecalculada, Error, string[]>({
    mutationFn: (pedidoIds) =>
      apiClient.post<OrdemRecalculada>('/roteirizacao/reordenar', {
        body: { pedido_ids: pedidoIds },
        schema: RoteirizacaoReordenarSaida,
      }),
  })
}

/** POST /v1/roteirizacao/aceitar: cria a corrida (`sugerida`). Atualiza o painel do despacho. */
export function useAceitarSugestao() {
  const qc = useQueryClient()
  return useMutation<CorridaCriada, Error, { pedidoIds: string[]; motoboyId?: string }>({
    mutationFn: ({ pedidoIds, motoboyId }) =>
      apiClient.post<CorridaCriada>('/roteirizacao/aceitar', {
        body: { pedido_ids: pedidoIds, ...(motoboyId ? { motoboy_id: motoboyId } : {}) },
        schema: CorridaSaida,
      }),
    onSuccess: () => {
      // O painel do despacho tem a raiz 'despacho' (chave de cache, nao import do modulo).
      void qc.invalidateQueries({ queryKey: ['despacho'] })
    },
  })
}
