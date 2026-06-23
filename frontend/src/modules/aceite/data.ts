// Estado de servidor do módulo aceite (TanStack Query): fala SEMPRE pela `api` REST;
// nunca SELECT anônimo (risco nº 2). O aceite do CONVITE saiu para o WhatsApp (E5: sem
// site); aqui ficam só as ações do devedor por link (`/v1/acao/:token`), que são de E7.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  acaoResposta,
  type AcaoResposta,
  type AcaoDevedor,
} from '@/shared/contracts'

/** POST público (sem JWT). Idempotente por estado: terminal → aplicado=false. */
export function useAcao(token: string) {
  const qc = useQueryClient()
  return useMutation<AcaoResposta, unknown, AcaoDevedor>({
    mutationFn: (acao) =>
      apiClient.post<AcaoResposta>(`/acao/${token}`, {
        body: { acao },
        schema: acaoResposta,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['aceite', 'acao', token] })
    },
  })
}
