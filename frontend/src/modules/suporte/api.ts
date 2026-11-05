// Camada de dados do modulo `suporte` (lado da LOJA: o dono/gerente da loja). A loja efetiva vem
// SEMPRE do escopo (header `x-loja-id` da loja ativa), nunca do corpo (SEC-002): por isso aqui NAO
// usamos `semLoja` nem `lojaId` (isso e so do console). Este modulo NUNCA importa outro modulo
// (coordena so por contrato/HTTP). Raiz de cache ['suporte'].
//   GET   /v1/suporte/chamados                  lista de chamados da loja
//   POST  /v1/suporte/chamados                  abre um chamado (assunto + 1a mensagem)
//   GET   /v1/suporte/chamados/:id              ficha do chamado (fio de mensagens)
//   POST  /v1/suporte/chamados/:id/mensagens    manda uma mensagem no chamado
//   PATCH /v1/suporte/chamados/:id              encerra o chamado (status 'resolvido')
//   GET   /v1/suporte/acessos                   lista de acessos assistidos concedidos
//   POST  /v1/suporte/acessos                   concede um acesso assistido (consentimento)
//   POST  /v1/suporte/acessos/:id/revogar       revoga um acesso assistido
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  AcessoSuporte,
  ChamadoFicha,
  ChamadoMensagem,
  ChamadoResumo,
  ListaAcessos,
  ListaChamados,
  type NovaMensagem,
  type NovoAcesso,
  type NovoChamado,
} from '@/shared/contracts/_generated/suporte'

export const RAIZ = 'suporte'

/** GET /v1/suporte/chamados: todos os chamados da loja ativa (mais recentes primeiro). */
export function useChamados() {
  return useQuery({
    queryKey: [RAIZ, 'chamados'],
    queryFn: ({ signal }) =>
      apiClient.get<ListaChamados>('/suporte/chamados', { schema: ListaChamados, signal }),
  })
}

/** GET /v1/suporte/chamados/:id: ficha com o fio de mensagens em ordem cronologica. */
export function useChamado(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'chamado', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<ChamadoFicha>(`/suporte/chamados/${id}`, { schema: ChamadoFicha, signal }),
  })
}

/** POST /v1/suporte/chamados: abre um chamado (assunto + a primeira mensagem). */
export function useAbrirChamado() {
  const qc = useQueryClient()
  return useMutation<ChamadoResumo, Error, NovoChamado>({
    mutationFn: (body) =>
      apiClient.post<ChamadoResumo>('/suporte/chamados', { body, schema: ChamadoResumo }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'chamados'] }),
  })
}

/** POST /v1/suporte/chamados/:id/mensagens: responde no chamado. */
export function useEnviarMensagem(chamadoId: string) {
  const qc = useQueryClient()
  return useMutation<ChamadoMensagem, Error, NovaMensagem>({
    mutationFn: (body) =>
      apiClient.post<ChamadoMensagem>(`/suporte/chamados/${chamadoId}/mensagens`, {
        body,
        schema: ChamadoMensagem,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [RAIZ, 'chamado', chamadoId] })
      void qc.invalidateQueries({ queryKey: [RAIZ, 'chamados'] })
    },
  })
}

/** PATCH /v1/suporte/chamados/:id: encerra o chamado (unica transicao da loja). */
export function useResolverChamado() {
  const qc = useQueryClient()
  return useMutation<ChamadoResumo, Error, string>({
    mutationFn: (id) =>
      apiClient.patch<ChamadoResumo>(`/suporte/chamados/${id}`, {
        body: { status: 'resolvido' },
        schema: ChamadoResumo,
      }),
    onSuccess: (_d, id) => {
      void qc.invalidateQueries({ queryKey: [RAIZ, 'chamado', id] })
      void qc.invalidateQueries({ queryKey: [RAIZ, 'chamados'] })
    },
  })
}

/** GET /v1/suporte/acessos: os acessos assistidos concedidos (ativos e passados). */
export function useAcessos() {
  return useQuery({
    queryKey: [RAIZ, 'acessos'],
    queryFn: ({ signal }) =>
      apiClient.get<ListaAcessos>('/suporte/acessos', { schema: ListaAcessos, signal }),
  })
}

/** POST /v1/suporte/acessos: concede um acesso assistido temporario a equipe Whaviso. */
export function useConcederAcesso() {
  const qc = useQueryClient()
  return useMutation<AcessoSuporte, Error, NovoAcesso>({
    mutationFn: (body) =>
      apiClient.post<AcessoSuporte>('/suporte/acessos', { body, schema: AcessoSuporte }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'acessos'] }),
  })
}

/** POST /v1/suporte/acessos/:id/revogar: encerra um acesso assistido na hora. */
export function useRevogarAcesso() {
  const qc = useQueryClient()
  return useMutation<AcessoSuporte, Error, string>({
    mutationFn: (id) =>
      apiClient.post<AcessoSuporte>(`/suporte/acessos/${id}/revogar`, { schema: AcessoSuporte }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [RAIZ, 'acessos'] }),
  })
}
