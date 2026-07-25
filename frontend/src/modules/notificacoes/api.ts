// Camada de dados do módulo notificacoes (H10.10, item 6): GET /v1/notificacoes +
// POST /v1/notificacoes/:id/marcar-lida + GET /v1/painel/pendencias ("precisa de você",
// H9.2). Contratos Zod PRÓPRIOS deste módulo (não importa o pacote do backend nem o
// módulo painel, mesma convenção/fronteira dos demais módulos do front); espelham
// manualmente os contratos de backend/packages/shared/src/contracts/payloads.ts e o
// `painelPendenciasResposta` de `@/shared/contracts` (kernel compartilhado, não um
// módulo, por isso pode ser reaproveitado sem violar a fronteira). Estado de servidor
// 100% via TanStack Query; dados só pelo api_client (nunca supabase.from()).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import { painelPendenciasResposta, type PainelPendenciasResposta } from '@/shared/contracts'

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
  total: z.number().int(),
  page: z.number().int(),
  per_page: z.number().int(),
  // Total de não lidas (independente da página atual): é o número do atalho do sino.
  nao_lidas: z.number().int(),
})
export type NotificacoesCentralResposta = z.infer<typeof notificacoesCentralResposta>

const marcarNotificacaoLidaResposta = z.object({ lida: z.boolean() })

export const notificacoesKeys = {
  central: ['notificacoes', 'central'] as const,
  pendencias: ['notificacoes', 'pendencias'] as const,
}

/**
 * GET /v1/notificacoes: feed cronológico paginado das notificações do usuário logado.
 * `refetchInterval` mantém o contador do atalho do sino perto do estado real sem exigir
 * uma conexão em tempo real (o produto não tem websocket).
 */
export function useNotificacoesCentral(page = 1, perPage = 20) {
  return useQuery({
    queryKey: [...notificacoesKeys.central, page, perPage],
    queryFn: ({ signal }) =>
      apiClient.get<NotificacoesCentralResposta>('/notificacoes', {
        schema: notificacoesCentralResposta,
        query: { page, per_page: perPage },
        signal,
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

/**
 * POST /v1/notificacoes/:id/marcar-lida: marca UMA notificação como lida (decisão de
 * produto: o contador só cai item a item, ao clicar naquele específico; nunca em massa).
 * Invalida a central para refletir `lida=true`/`nao_lidas` atualizado na hora.
 */
export function useMarcarNotificacaoLida() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/notificacoes/${id}/marcar-lida`, { schema: marcarNotificacaoLidaResposta }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificacoesKeys.central })
    },
  })
}

/**
 * GET /v1/painel/pendencias: "precisa de você" (H9.2, pendências ABERTAS por combinado
 * que aguardam ação). Vive nesta página (H10.10) junto do histórico da central; contrato
 * mirado de `@/shared/contracts` (kernel compartilhado, não o módulo `painel`).
 */
export function usePendencias() {
  return useQuery({
    queryKey: notificacoesKeys.pendencias,
    queryFn: ({ signal }) =>
      apiClient.get<PainelPendenciasResposta>('/painel/pendencias', {
        schema: painelPendenciasResposta,
        signal,
      }),
  })
}
