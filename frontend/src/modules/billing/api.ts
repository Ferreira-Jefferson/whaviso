// Camada de dados do módulo billing (CARTEIRA DE CRÉDITOS, Épico 11): chamadas à `api`
// REST + hooks TanStack Query. Estado de servidor 100% via React Query; dados só pelo
// api_client (nunca supabase.from). Este módulo NUNCA importa outro módulo.
//
// Mapa REAL do backend (backend/apps/api/src/modules/billing/index.ts):
//   GET /v1/billing/carteira  ✔ { carteira: {saldo_livre,reservado,em_hold,consumido,ja_comprou}, catalogo: {curva} }
//   GET /v1/billing/extrato   ✔ lançamentos paginados (compra/crédito/reserva/consumo/devolução/hold)
//
// NÃO há endpoint de compra/auto-crédito: a compra é MANUAL via WhatsApp (o owner credita
// depois). O front só LÊ o saldo (espelho do servidor, H11.8) e o extrato.
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  carteiraResposta,
  extratoResposta,
  recargaResposta,
  type CarteiraResposta,
  type ExtratoResposta,
  type RecargaBody,
} from '@/shared/contracts'

// Item 19 (leva 2026-07-22 1D): a resposta da recarga ganhou o `id` (usado para anexar o
// comprovante depois). Extensão LOCAL do contrato (não editamos @/shared/contracts nesta
// leva: fora do escopo de arquivos desta tarefa; este módulo é o único que consome a recarga).
const recargaRespostaComId = recargaResposta.extend({ id: z.string() })
export type RecargaResposta = z.infer<typeof recargaRespostaComId>

// Só os 4 tipos de arquivo aceitos como comprovante (mesma faixa do backend).
export const MIME_COMPROVANTE_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export type MimeComprovante = (typeof MIME_COMPROVANTE_ACEITOS)[number]

const enviarComprovanteResposta = z.object({
  id: z.string(),
  status: z.enum(['aprovado', 'aguardando_revisao_manual']),
})
export type EnviarComprovanteResposta = z.infer<typeof enviarComprovanteResposta>

export const billingKeys = {
  todos: ['billing'] as const,
  carteira: ['billing', 'carteira'] as const,
  extrato: (page: number) => ['billing', 'extrato', page] as const,
}

/** GET /v1/billing/carteira: saldo da carteira + curva do catálogo (para o slider). */
export function useCarteira() {
  return useQuery({
    queryKey: billingKeys.carteira,
    queryFn: ({ signal }) =>
      apiClient.get<CarteiraResposta>('/billing/carteira', {
        schema: carteiraResposta,
        signal,
      }),
  })
}

/** GET /v1/billing/extrato: lançamentos da conta (paginado). */
export function useExtrato(page = 1) {
  return useQuery({
    queryKey: billingKeys.extrato(page),
    queryFn: ({ signal }) =>
      apiClient.get<ExtratoResposta>(`/billing/extrato?page=${page}`, {
        schema: extratoResposta,
        signal,
      }),
  })
}

/**
 * POST /v1/billing/recarga: confirma a recarga e o servidor EMPURRA a mensagem de compra
 * (template + chave Pix da plataforma) para o WhatsApp do próprio usuário. NÃO credita
 * saldo (o owner credita após o pagamento). Não invalida a carteira (o saldo não muda).
 * Erros tratados pela tela: telefone_ausente (422) e pix_nao_configurado (422).
 */
export function useRecarga() {
  return useMutation<RecargaResposta, Error, RecargaBody>({
    mutationFn: (body) =>
      apiClient.post<RecargaResposta>('/billing/recarga', { body, schema: recargaRespostaComId }),
  })
}

/**
 * POST /v1/billing/recarga/:id/comprovante (item 19, H11.14): anexa o comprovante da recarga
 * (JSON base64; o backend não tem multipart, ver MODULE.md do billing). Confiança alta da IA
 * + valor batendo credita na hora (status 'aprovado'); qualquer outro caso fica
 * 'aguardando_revisao_manual' (o owner resolve depois). Nunca lança para 'rejeitado' sozinho.
 */
export function useEnviarComprovante() {
  return useMutation<
    EnviarComprovanteResposta,
    Error,
    { recargaId: string; arquivoBase64: string; arquivoMime: MimeComprovante }
  >({
    mutationFn: ({ recargaId, arquivoBase64, arquivoMime }) =>
      apiClient.post<EnviarComprovanteResposta>(`/billing/recarga/${recargaId}/comprovante`, {
        body: { arquivo_base64: arquivoBase64, arquivo_mime: arquivoMime },
        schema: enviarComprovanteResposta,
      }),
  })
}
