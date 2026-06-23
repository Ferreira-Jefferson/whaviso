// Camada de dados do módulo billing: chamadas à `api` REST + hooks TanStack
// Query. Estado de servidor 100% via React Query; dados só pelo api_client
// (nunca supabase.from). Este módulo NUNCA importa outro módulo.
//
// Mapa REAL do backend (backend/apps/api/src/modules/billing/index.ts):
//   GET  /v1/billing/planos       ✔ { planos: [{ id, nome, preco_centavos, alavancas... }] }
//   GET  /v1/billing/assinatura   ✔ plano vigente + alavancas efetivas (conta nasce free)
//   POST /v1/billing/assinar      ✔ { plano_id, unidades? } → grava 'trial' (stub, sem gateway)
//
// Contador de uso (X de N itens na agenda): NÃO há endpoint dedicado. Enquanto
// `sem_aviso` (modo agenda, E4) não existe, a agenda = avisos ativos
// (qtd_pendentes + qtd_aguardando_aceite do GET /v1/painel/resumo). A UI só
// ESPELHA o backend (risco nº 7): não reimplementa a regra de limite, apenas
// mostra o contador e deixa o backend recusar (422 plano_somente_leitura /
// agenda_cheia) na criação do aviso.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  assinarResposta,
  assinaturaSchema,
  listaPlanosResposta,
  painelResumoResposta,
  type Assinatura,
  type AssinarBody,
  type AssinarResposta,
  type ListaPlanosResposta,
  type PainelResumoResposta,
} from '@/shared/contracts'

export const billingKeys = {
  todos: ['billing'] as const,
  planos: ['billing', 'planos'] as const,
  assinatura: ['billing', 'assinatura'] as const,
}

// Prefixo das queries do painel (uso de avisos ativos). Compartilhado por chave,
// nunca por import do módulo painel (fronteira do lint).
const PAINEL_USO = ['painel', 'resumo', {}] as const

/** GET /v1/billing/planos: catálogo de planos (centavos). */
export function usePlanos() {
  return useQuery({
    queryKey: billingKeys.planos,
    queryFn: ({ signal }) =>
      apiClient
        .get<ListaPlanosResposta>('/billing/planos', {
          schema: listaPlanosResposta,
          signal,
        })
        .then((r) => r.planos),
  })
}

/** GET /v1/billing/assinatura: plano atual + alavancas efetivas da conta. */
export function useAssinatura() {
  return useQuery({
    queryKey: billingKeys.assinatura,
    queryFn: ({ signal }) =>
      apiClient.get<Assinatura>('/billing/assinatura', {
        schema: assinaturaSchema,
        signal,
      }),
  })
}

/**
 * Contador de uso da AGENDA (balde único) vs capacidade do plano. Espelha o
 * backend: enquanto `sem_aviso` (modo agenda) não existe, a agenda = avisos ativos
 * (qtd_pendentes + qtd_aguardando_aceite do resumo). Quando o E4 ligar `sem_aviso`,
 * trocar por um contador de agenda dedicado. Reusa a chave do painel para
 * aproveitar o cache, sem importar o módulo painel.
 */
export function useUsoAtivos() {
  return useQuery({
    queryKey: PAINEL_USO,
    queryFn: ({ signal }) =>
      apiClient.get<PainelResumoResposta>('/painel/resumo', {
        schema: painelResumoResposta,
        signal,
      }),
    select: (r) => r.qtd_pendentes + r.qtd_aguardando_aceite,
  })
}

/** POST /v1/billing/assinar: assina/troca o plano (stub: grava 'trial'). */
export function useAssinar() {
  const qc = useQueryClient()
  return useMutation<AssinarResposta, Error, AssinarBody>({
    mutationFn: (body) =>
      apiClient.post<AssinarResposta>('/billing/assinar', {
        body,
        schema: assinarResposta,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: billingKeys.assinatura })
    },
  })
}
