// Camada de dados do modulo plataforma_configuracoes: segredos administraveis da PLATAFORMA
// (nao de loja). SO operador com `chaves_api:gerir`; rotas `semLoja`. Modulo nunca importa outro
// modulo (mesmo a credencial do Asaas, dona do modulo `pagamentos` no backend, e consumida aqui
// so por HTTP, sem importar nada de plataforma_cobranca). Raiz de cache ['plataforma_configuracoes'].
//   GET/PUT /v1/pagamentos/psp/credencial
//   GET/PUT /v1/credenciais-plataforma/whatsapp-oficial
//   GET/PUT /v1/credenciais-plataforma/email
//   GET/POST/PATCH /v1/llm/pool
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  AsaasStatus, EmailPlataformaStatus, PoolLlmItem, PoolLlmLista, WhatsappOficialStatus,
  type AsaasEntrada, type EmailPlataformaEntrada, type PoolLlmCriar, type PoolLlmPatch,
  type WhatsappOficialEntrada,
} from './contracts'

export const RAIZ = 'plataforma_configuracoes'

const OP = { semLoja: true } as const

function useInvalidarRaiz() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

// ---- Asaas ---------------------------------------------------------------------------------
export function useAsaasStatus() {
  return useQuery({
    queryKey: [RAIZ, 'asaas'],
    queryFn: ({ signal }) =>
      apiClient.get<AsaasStatus>('/pagamentos/psp/credencial', { schema: AsaasStatus, signal, ...OP }),
  })
}

export function useSalvarAsaas() {
  const invalidar = useInvalidarRaiz()
  return useMutation<AsaasStatus, Error, AsaasEntrada>({
    mutationFn: (body) => apiClient.put<AsaasStatus>('/pagamentos/psp/credencial', { body, schema: AsaasStatus, ...OP }),
    onSettled: invalidar,
  })
}

// ---- WhatsApp oficial ------------------------------------------------------------------------
export function useWhatsappOficial() {
  return useQuery({
    queryKey: [RAIZ, 'whatsapp_oficial'],
    queryFn: ({ signal }) =>
      apiClient.get<WhatsappOficialStatus>('/credenciais-plataforma/whatsapp-oficial', {
        schema: WhatsappOficialStatus, signal, ...OP,
      }),
  })
}

export function useSalvarWhatsappOficial() {
  const invalidar = useInvalidarRaiz()
  return useMutation<WhatsappOficialStatus, Error, WhatsappOficialEntrada>({
    mutationFn: (body) =>
      apiClient.put<WhatsappOficialStatus>('/credenciais-plataforma/whatsapp-oficial', {
        body, schema: WhatsappOficialStatus, ...OP,
      }),
    onSettled: invalidar,
  })
}

// ---- E-mail transacional ---------------------------------------------------------------------
export function useEmailPlataforma() {
  return useQuery({
    queryKey: [RAIZ, 'email'],
    queryFn: ({ signal }) =>
      apiClient.get<EmailPlataformaStatus>('/credenciais-plataforma/email', { schema: EmailPlataformaStatus, signal, ...OP }),
  })
}

export function useSalvarEmailPlataforma() {
  const invalidar = useInvalidarRaiz()
  return useMutation<EmailPlataformaStatus, Error, EmailPlataformaEntrada>({
    mutationFn: (body) =>
      apiClient.put<EmailPlataformaStatus>('/credenciais-plataforma/email', { body, schema: EmailPlataformaStatus, ...OP }),
    onSettled: invalidar,
  })
}

// ---- Pool de chaves de LLM --------------------------------------------------------------------
export function usePoolLlm() {
  return useQuery({
    queryKey: [RAIZ, 'pool_llm'],
    queryFn: ({ signal }) => apiClient.get<PoolLlmItem[]>('/llm/pool', { schema: PoolLlmLista, signal, ...OP }),
  })
}

export function useCriarPoolLlm() {
  const invalidar = useInvalidarRaiz()
  return useMutation<PoolLlmItem, Error, PoolLlmCriar>({
    mutationFn: (body) => apiClient.post<PoolLlmItem>('/llm/pool', { body, schema: PoolLlmItem, ...OP }),
    onSettled: invalidar,
  })
}

export function useAjustarPoolLlm() {
  const invalidar = useInvalidarRaiz()
  return useMutation<PoolLlmItem, Error, { id: string; patch: PoolLlmPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<PoolLlmItem>(`/llm/pool/${id}`, { body: patch, schema: PoolLlmItem, ...OP }),
    onSettled: invalidar,
  })
}
