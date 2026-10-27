// Camada de dados do modulo plataforma_funil (CRM de aquisicao da equipe Whaviso). Rotas de
// OPERADOR: sem x-loja-id (`semLoja`). Este modulo NUNCA importa outro modulo. Raiz de cache
// ['plataforma_funil'].
//   GET   /v1/plataforma-funil/prospectos?estagio&cidade&q&cursor&limite   lista paginada (telefone mascarado)
//   POST  /v1/plataforma-funil/prospectos                                  cria (retorna detalhe)
//   GET   /v1/plataforma-funil/prospectos/:id                              detalhe (unico com telefone em claro)
//   PATCH /v1/plataforma-funil/prospectos/:id
//   POST  /v1/plataforma-funil/prospectos/:id/estagio                      { estagio, motivo? }
//   POST  /v1/plataforma-funil/prospectos/:id/vincular-conta               { conta_id } (vira `ativo`)
//   GET   /v1/plataforma-funil/prospectos/:id/atividades?cursor&limite
//   POST  /v1/plataforma-funil/prospectos/:id/atividades
//   GET   /v1/plataforma-funil/funil/quadro?limite_por_estagio
//   GET   /v1/plataforma-funil/funil/agenda?dias&todos
// PII: o telefone claro so existe no detalhe e na entrada do formulario; nunca em cache de lista,
// nunca em log. Contas (para vincular) sao buscadas por HTTP em `/plataforma-clientes/contas`.
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  AgendaFollowUpLista,
  AtividadeDTO,
  AtividadePagina,
  FunilQuadro,
  ProspectoDetalheDTO,
  ProspectoPagina,
  type AtividadeNova,
  type EstagioMudarEntrada,
  type ProspectoAtualizacao,
  type ProspectoNovo,
} from '@/shared/contracts/_generated/plataforma_funil'
import { PlataformaContaPagina } from '@/shared/contracts/_generated/plataforma_clientes'
import type { EstagioProspecto } from '@/shared/contracts/_generated/enums'

export const RAIZ = 'plataforma_funil'

const OP = { semLoja: true } as const
const LIMITE_PAGINA = 20

export type Quadro = z.infer<typeof FunilQuadro>
export type Agenda = z.infer<typeof AgendaFollowUpLista>
export type ProspectoDetalhe = z.infer<typeof ProspectoDetalheDTO>

function useInvalidarRaiz() {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: [RAIZ] })
}

// ---------------------------------------------------------------------------------------------
// Quadro e agenda
// ---------------------------------------------------------------------------------------------
export function useQuadro(limitePorEstagio = 10) {
  return useQuery({
    queryKey: [RAIZ, 'quadro', limitePorEstagio],
    queryFn: ({ signal }) =>
      apiClient.get<Quadro>('/plataforma-funil/funil/quadro', {
        query: { limite_por_estagio: limitePorEstagio },
        schema: FunilQuadro,
        signal,
        ...OP,
      }),
  })
}

export function useAgenda(dias: number, todos: boolean) {
  return useQuery({
    queryKey: [RAIZ, 'agenda', dias, todos],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      apiClient.get<Agenda>('/plataforma-funil/funil/agenda', {
        query: { dias, todos: todos ? 'true' : 'false' },
        schema: AgendaFollowUpLista,
        signal,
        ...OP,
      }),
  })
}

// ---------------------------------------------------------------------------------------------
// Prospectos
// ---------------------------------------------------------------------------------------------
export interface FiltroProspectos {
  estagio?: EstagioProspecto
  cidade?: string
  q?: string
}

export function useProspectos(f: FiltroProspectos) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'lista', f.estagio ?? '', f.cidade ?? '', f.q ?? ''],
    initialPageParam: undefined as string | undefined,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<z.infer<typeof ProspectoPagina>>('/plataforma-funil/prospectos', {
        query: { estagio: f.estagio, cidade: f.cidade, q: f.q, cursor: pageParam, limite: LIMITE_PAGINA },
        schema: ProspectoPagina,
        signal,
        ...OP,
      }),
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  })
}

export function useProspecto(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'detalhe', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<ProspectoDetalhe>(`/plataforma-funil/prospectos/${id}`, {
        schema: ProspectoDetalheDTO,
        signal,
        ...OP,
      }),
  })
}

export function useCriarProspecto() {
  const invalidar = useInvalidarRaiz()
  return useMutation<ProspectoDetalhe, Error, ProspectoNovo>({
    mutationFn: (body) =>
      apiClient.post<ProspectoDetalhe>('/plataforma-funil/prospectos', { body, schema: ProspectoDetalheDTO, ...OP }),
    onSettled: invalidar,
  })
}

export function useAtualizarProspecto() {
  const invalidar = useInvalidarRaiz()
  return useMutation<ProspectoDetalhe, Error, { id: string; patch: ProspectoAtualizacao }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<ProspectoDetalhe>(`/plataforma-funil/prospectos/${id}`, {
        body: patch,
        schema: ProspectoDetalheDTO,
        ...OP,
      }),
    onSettled: invalidar,
  })
}

export function useMudarEstagio() {
  const invalidar = useInvalidarRaiz()
  return useMutation<ProspectoDetalhe, Error, { id: string; body: EstagioMudarEntrada }>({
    mutationFn: ({ id, body }) =>
      apiClient.post<ProspectoDetalhe>(`/plataforma-funil/prospectos/${id}/estagio`, {
        body,
        schema: ProspectoDetalheDTO,
        ...OP,
      }),
    onSettled: invalidar,
  })
}

export function useVincularConta() {
  const invalidar = useInvalidarRaiz()
  return useMutation<ProspectoDetalhe, Error, { id: string; contaId: string }>({
    mutationFn: ({ id, contaId }) =>
      apiClient.post<ProspectoDetalhe>(`/plataforma-funil/prospectos/${id}/vincular-conta`, {
        body: { conta_id: contaId },
        schema: ProspectoDetalheDTO,
        ...OP,
      }),
    onSettled: invalidar,
  })
}

// ---------------------------------------------------------------------------------------------
// Atividades (append-only)
// ---------------------------------------------------------------------------------------------
export function useAtividades(prospectoId: string | null) {
  return useInfiniteQuery({
    queryKey: [RAIZ, 'atividades', prospectoId],
    enabled: prospectoId != null,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      apiClient.get<z.infer<typeof AtividadePagina>>(`/plataforma-funil/prospectos/${prospectoId}/atividades`, {
        query: { cursor: pageParam, limite: LIMITE_PAGINA },
        schema: AtividadePagina,
        signal,
        ...OP,
      }),
    getNextPageParam: (ultima) => ultima.proximoCursor ?? undefined,
  })
}

export function useCriarAtividade() {
  const invalidar = useInvalidarRaiz()
  return useMutation<z.infer<typeof AtividadeDTO>, Error, { prospectoId: string; body: AtividadeNova }>({
    mutationFn: ({ prospectoId, body }) =>
      apiClient.post<z.infer<typeof AtividadeDTO>>(`/plataforma-funil/prospectos/${prospectoId}/atividades`, {
        body,
        schema: AtividadeDTO,
        ...OP,
      }),
    onSettled: invalidar,
  })
}

// ---------------------------------------------------------------------------------------------
// Contas (so leitura, para vincular um prospecto a conta criada pelo cadastro do restaurante)
// ---------------------------------------------------------------------------------------------
export function useBuscaContas(busca: string) {
  const termo = busca.trim()
  return useQuery({
    queryKey: [RAIZ, 'contas', termo],
    enabled: termo.length >= 2,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      apiClient.get<PlataformaContaPagina>('/plataforma-clientes/contas', {
        query: { busca: termo, limite: 8 },
        schema: PlataformaContaPagina,
        signal,
        ...OP,
      }),
  })
}
