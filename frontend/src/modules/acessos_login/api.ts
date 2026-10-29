// Camada de dados da allowlist de login (console do operador). Rotas de plataforma: `semLoja`
// (nao enviam x-loja-id). Este modulo NUNCA importa outro modulo. Raiz de cache ['acessos_login'].
//   GET  /v1/acessos-login?status
//   POST /v1/acessos-login                 { email, observacao? }
//   POST /v1/acessos-login/:id/aprovar
//   POST /v1/acessos-login/:id/revogar
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import { AcessoDTO, AcessosLista, type AcessoAdicionar, type AcessoStatus } from './contracts'

export const RAIZ = 'acessos_login'
const OP = { semLoja: true } as const

export function useAcessos(status: AcessoStatus | undefined) {
  return useQuery({
    queryKey: [RAIZ, status ?? ''],
    queryFn: ({ signal }) =>
      apiClient.get<AcessoDTO[]>('/acessos-login', { query: { status }, schema: AcessosLista, signal, ...OP }),
  })
}

function useInvalidar() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

export function useAdicionarAcesso() {
  const invalidar = useInvalidar()
  return useMutation<AcessoDTO, Error, AcessoAdicionar>({
    mutationFn: (body) => apiClient.post<AcessoDTO>('/acessos-login', { body, schema: AcessoDTO, ...OP }),
    onSettled: invalidar,
  })
}

export function useAprovarAcesso() {
  const invalidar = useInvalidar()
  return useMutation<AcessoDTO, Error, string>({
    mutationFn: (id) => apiClient.post<AcessoDTO>(`/acessos-login/${id}/aprovar`, { schema: AcessoDTO, ...OP }),
    onSettled: invalidar,
  })
}

export function useRevogarAcesso() {
  const invalidar = useInvalidar()
  return useMutation<AcessoDTO, Error, string>({
    mutationFn: (id) => apiClient.post<AcessoDTO>(`/acessos-login/${id}/revogar`, { schema: AcessoDTO, ...OP }),
    onSettled: invalidar,
  })
}
