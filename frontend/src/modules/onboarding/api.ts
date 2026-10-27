// Camada de dados do onboarding (raiz de cache ['onboarding']). Read-model do servidor: nada e
// gravado nem calculado no cliente. Loja ativa vai no header x-loja-id (nunca no corpo).
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import { OnboardingSaida } from '@/shared/contracts/_generated/onboarding'

export const RAIZ = 'onboarding'

/** GET /v1/onboarding: checklist da loja ativa + tempo ate o primeiro pedido. */
export function useOnboarding() {
  return useQuery({
    queryKey: [RAIZ],
    queryFn: ({ signal }) => apiClient.get<OnboardingSaida>('/onboarding', { schema: OnboardingSaida, signal }),
  })
}
