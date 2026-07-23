// Camada de dados do módulo notificacoes (H10.10, item 6): GET /v1/notificacoes +
// POST /v1/notificacoes/marcar-lidas. Contrato Zod PRÓPRIO deste módulo (não importa o
// pacote do backend, mesma convenção dos demais módulos do front); espelha manualmente
// `notificacaoCentralSchema`/`notificacoesCentralResposta` de
// backend/packages/shared/src/contracts/payloads.ts. Estado de servidor 100% via
// TanStack Query; dados só pelo api_client (nunca supabase.from()).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient } from '@/shared/api_client'

// Só as categorias do item 6 entram aqui (ver historias/10-notificacoes-cobrador.md
// H10.10): pagamento informado/reportado (mesmo evento) e dado incorreto reportado
// (outbox `notificacoes_cobrador`), e recarga de créditos (outbox `notificacoes_billing`).
export const origemNotificacaoCentral = z.enum(['cobrador', 'billing'])
export type OrigemNotificacaoCentral = z.infer<typeof origemNotificacaoCentral>

export const tipoNotificacaoCentral = z.enum([
  'pagamento_informado',
  'combinado_dado_incorreto',
  'recarga',
])
export type TipoNotificacaoCentral = z.infer<typeof tipoNotificacaoCentral>

export const notificacaoCentralSchema = z.object({
  id: z.string(),
  origem: origemNotificacaoCentral,
  tipo: tipoNotificacaoCentral,
  // Presente só quando origem === 'cobrador' (aponta o combinado); recarga não tem aviso.
  aviso_id: z.string().nullable(),
  criado_em: z.coerce.date(),
  lida: z.boolean(),
})
export type NotificacaoCentral = z.infer<typeof notificacaoCentralSchema>

export const notificacoesCentralResposta = z.object({
  itens: z.array(notificacaoCentralSchema),
  // Total de não lidas (não limitado por `limit`): é o número do badge do sino.
  nao_lidas: z.number().int(),
})
export type NotificacoesCentralResposta = z.infer<typeof notificacoesCentralResposta>

const marcarNotificacoesLidasResposta = z.object({ marcadas: z.number().int() })

export const notificacoesKeys = {
  central: ['notificacoes', 'central'] as const,
}

/**
 * GET /v1/notificacoes: feed cronológico (mais recentes primeiro) das notificações do
 * usuário logado. `refetchInterval` mantém o badge do sino perto do estado real sem
 * exigir uma conexão em tempo real (o produto não tem websocket).
 */
export function useNotificacoesCentral(limit = 20) {
  return useQuery({
    queryKey: [...notificacoesKeys.central, limit],
    queryFn: ({ signal }) =>
      apiClient.get<NotificacoesCentralResposta>('/notificacoes', {
        schema: notificacoesCentralResposta,
        query: { limit },
        signal,
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

/**
 * POST /v1/notificacoes/marcar-lidas: marca TODAS as não lidas do usuário de uma vez
 * (mecanismo escolhido no backend: abrir o sino zera o contador). Invalida a central para
 * refletir `lida=true`/`nao_lidas=0` na hora.
 */
export function useMarcarNotificacoesLidas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiClient.post('/notificacoes/marcar-lidas', { schema: marcarNotificacoesLidasResposta }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificacoesKeys.central })
    },
  })
}
