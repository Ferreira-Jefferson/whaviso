// Camada de dados do modulo caixa (PDV): sessao de caixa da loja ativa.
// Estado de servidor via TanStack Query; dados so pelo api_client. Raiz de cache ['caixa'].
// A loja efetiva vem do header x-loja-id (api_client), nunca do corpo (SEC-002).
// Dinheiro sempre em centavos (inteiro).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  CaixaRelatorioSaida,
  CaixaSaida,
  MovimentoSaida,
  SessaoAbertaSaida,
  type CaixaAbrirEntrada,
  type CaixaFecharEntrada,
  type MovimentoEntrada,
} from '@/shared/contracts/_generated/caixa'

export const RAIZ = 'caixa'

/** GET /v1/caixa/aberto: sessao de caixa aberta da loja ativa (ou { caixa: null }). */
export function useSessaoAberta() {
  return useQuery({
    queryKey: [RAIZ, 'aberto'],
    queryFn: ({ signal }) =>
      apiClient.get<SessaoAbertaSaida>('/caixa/aberto', { schema: SessaoAbertaSaida, signal }),
  })
}

/** GET /v1/caixa/:id/relatorio: totais por forma, vendas/sangrias/suprimentos e movimentos. */
export function useRelatorioCaixa(caixaId: string | null | undefined) {
  return useQuery({
    queryKey: [RAIZ, 'relatorio', caixaId],
    enabled: caixaId != null,
    queryFn: ({ signal }) =>
      apiClient.get<CaixaRelatorioSaida>(`/caixa/${caixaId}/relatorio`, {
        schema: CaixaRelatorioSaida,
        signal,
      }),
  })
}

/** POST /v1/caixa/abrir: abre a sessao com o saldo inicial (troco em gaveta). */
export function useAbrirCaixa() {
  const qc = useQueryClient()
  return useMutation<CaixaSaida, Error, CaixaAbrirEntrada>({
    mutationFn: (body) => apiClient.post<CaixaSaida>('/caixa/abrir', { body, schema: CaixaSaida }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}

/** POST /v1/caixa/:id/movimentos: lanca venda, sangria ou suprimento na sessao aberta. */
export function useRegistrarMovimento() {
  const qc = useQueryClient()
  return useMutation<MovimentoSaida, Error, { caixaId: string } & MovimentoEntrada>({
    mutationFn: ({ caixaId, ...body }) =>
      apiClient.post<MovimentoSaida>(`/caixa/${caixaId}/movimentos`, { body, schema: MovimentoSaida }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}

/** POST /v1/caixa/:id/fechar: confere o saldo informado e encerra a sessao. */
export function useFecharCaixa() {
  const qc = useQueryClient()
  return useMutation<CaixaSaida, Error, { caixaId: string } & CaixaFecharEntrada>({
    mutationFn: ({ caixaId, ...body }) =>
      apiClient.post<CaixaSaida>(`/caixa/${caixaId}/fechar`, { body, schema: CaixaSaida }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ] })
    },
  })
}

export type { CaixaSaida, CaixaRelatorioSaida, MovimentoSaida }
