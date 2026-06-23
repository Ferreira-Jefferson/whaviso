// Kernel `shared` do PLANO vigente: lê GET /v1/billing/assinatura e expõe o flag de
// "somente leitura" (free só visualiza, H9.8). Consumido por `painel`/`avisos` SEM que
// os módulos importem `billing` (fronteira do lint). A AUTORIDADE da restrição é a API
// (ação proibida retorna envelope de erro); o front só esconde/CTA. NUNCA inferimos
// "free" no cliente: o flag vem do backend (alavancas_do_plano.somente_leitura).
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../api_client'
import { assinaturaSchema, type Assinatura } from '../contracts'

export const planoKeys = {
  assinatura: ['billing', 'assinatura'] as const,
}

/** GET /v1/billing/assinatura: plano vigente + alavancas efetivas da conta. */
export function useAssinaturaVigente() {
  return useQuery({
    queryKey: planoKeys.assinatura,
    queryFn: ({ signal }) =>
      apiClient.get<Assinatura>('/billing/assinatura', {
        schema: assinaturaSchema,
        signal,
      }),
  })
}

/**
 * `somenteLeitura` = o plano só visualiza (free): ações que exigem plano levam à CTA,
 * a navegação não quebra (H9.8). Enquanto carrega, assume `false` (não bloqueia a UI à
 * toa; a API barra de fato se for o caso). Flag vindo do backend, nunca inferido.
 */
export function usePlanoSomenteLeitura(): { somenteLeitura: boolean; isLoading: boolean } {
  const q = useAssinaturaVigente()
  return { somenteLeitura: q.data?.somente_leitura === true, isLoading: q.isLoading }
}
