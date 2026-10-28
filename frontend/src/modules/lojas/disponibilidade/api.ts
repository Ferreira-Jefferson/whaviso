// Camada de dados da disponibilidade da loja: horario de atendimento (pedido ao vivo), janela
// de agendamento (desligado|faixa|24h) e excecoes. Fonte unica na loja; o atendente nao tem
// horario proprio. Estado de servidor via TanStack Query; dados so pelo api_client (prefixo
// /v1 + /disponibilidade). Raiz de cache ['disponibilidade']: qualquer escrita a invalida
// (lista + estado "aceitando agora" + modo do atendente). Horas sao locais (America/Sao_Paulo):
// o backend decide; a tela so edita o cadastro. Trocar de loja limpa o cache (TenantProvider),
// e o api_client envia a loja ativa no header, entao nao keyamos por lojaId aqui.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  AgendamentoConfigSaida,
  AgendamentoGetSaida,
  DisponibilidadeAgoraSaida,
  ExcecaoListaSaida,
  ExcecaoSaida,
  HorarioListaSaida,
  HorarioSaida,
  type AgendamentoConfigSaida as Agendamento,
  type AgendamentoEntrada,
  type ExcecaoEntrada,
  type ExcecaoSaida as Excecao,
  type HorarioEntrada,
  type HorarioPatch,
  type HorarioSaida as Horario,
} from '@/shared/contracts/_generated/disponibilidade'

export const RAIZ = 'disponibilidade'
const BASE = '/disponibilidade'

interface ListaHorarios {
  itens: Horario[]
}
interface ListaExcecoes {
  itens: Excecao[]
}
interface AgendamentoGet {
  agendamento: Agendamento
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  // Uma escrita em qualquer secao muda os derivados "aceitando agora" e "modo do atendente":
  // invalida a raiz toda.
  void qc.invalidateQueries({ queryKey: [RAIZ] })
}

// --- Estado derivado: a loja aceita pedido ao vivo agora? Em que modo o atendente esta? ---
/** GET /v1/disponibilidade/agora. Atualiza sozinho de minuto em minuto. */
export function useAgora() {
  return useQuery({
    queryKey: [RAIZ, 'agora'],
    queryFn: ({ signal }) =>
      apiClient.get<DisponibilidadeAgoraSaida>(`${BASE}/agora`, {
        schema: DisponibilidadeAgoraSaida,
        signal,
      }),
    refetchInterval: 60_000,
  })
}

// --- Horarios de atendimento (varias faixas por dia; pedido ao vivo) ---
/** GET /v1/disponibilidade/horarios. */
export function useHorarios() {
  return useQuery({
    queryKey: [RAIZ, 'horarios'],
    queryFn: ({ signal }) =>
      apiClient.get<ListaHorarios>(`${BASE}/horarios`, { schema: HorarioListaSaida, signal }),
    select: (d) => d.itens,
  })
}

/** POST /v1/disponibilidade/horarios: cria uma faixa de um dia. */
export function useCriarHorario() {
  const qc = useQueryClient()
  return useMutation<Horario, Error, HorarioEntrada>({
    mutationFn: (body) => apiClient.post<Horario>(`${BASE}/horarios`, { body, schema: HorarioSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** PATCH /v1/disponibilidade/horarios/:id: edita abre/fecha ou reativa (ativo). */
export function useAtualizarHorario() {
  const qc = useQueryClient()
  return useMutation<Horario, Error, { id: string; body: HorarioPatch }>({
    mutationFn: ({ id, body }) =>
      apiClient.patch<Horario>(`${BASE}/horarios/${id}`, { body, schema: HorarioSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** POST /v1/disponibilidade/horarios/:id/desativar: remove a faixa (sem apagar: vira inativa). */
export function useDesativarHorario() {
  const qc = useQueryClient()
  return useMutation<Horario, Error, { id: string }>({
    mutationFn: ({ id }) => apiClient.post<Horario>(`${BASE}/horarios/${id}/desativar`, { schema: HorarioSaida }),
    onSuccess: () => invalidar(qc),
  })
}

// --- Janela de agendamento (modo desligado|faixa|24h): vale alem do horario de atendimento ---
/** GET /v1/disponibilidade/agendamento: `agendamento` vem como desligado quando nunca configurado. */
export function useAgendamento() {
  return useQuery({
    queryKey: [RAIZ, 'agendamento'],
    queryFn: ({ signal }) =>
      apiClient.get<AgendamentoGet>(`${BASE}/agendamento`, { schema: AgendamentoGetSaida, signal }),
    select: (d) => d.agendamento,
  })
}

/** PUT /v1/disponibilidade/agendamento: define (substitui) a janela de agendamento. */
export function useDefinirAgendamento() {
  const qc = useQueryClient()
  return useMutation<Agendamento, Error, AgendamentoEntrada>({
    mutationFn: (body) => apiClient.put<Agendamento>(`${BASE}/agendamento`, { body, schema: AgendamentoConfigSaida }),
    onSuccess: () => invalidar(qc),
  })
}

// --- Excecoes / feriados ---
/** GET /v1/disponibilidade/excecoes. */
export function useExcecoes() {
  return useQuery({
    queryKey: [RAIZ, 'excecoes'],
    queryFn: ({ signal }) =>
      apiClient.get<ListaExcecoes>(`${BASE}/excecoes`, { schema: ExcecaoListaSaida, signal }),
    select: (d) => d.itens,
  })
}

/** POST /v1/disponibilidade/excecoes: marca uma data fechada ou com horario especial. */
export function useCriarExcecao() {
  const qc = useQueryClient()
  return useMutation<Excecao, Error, ExcecaoEntrada>({
    mutationFn: (body) => apiClient.post<Excecao>(`${BASE}/excecoes`, { body, schema: ExcecaoSaida }),
    onSuccess: () => invalidar(qc),
  })
}

/** POST /v1/disponibilidade/excecoes/:id/desativar: desfaz a excecao (sem apagar). */
export function useDesativarExcecao() {
  const qc = useQueryClient()
  return useMutation<Excecao, Error, { id: string }>({
    mutationFn: ({ id }) => apiClient.post<Excecao>(`${BASE}/excecoes/${id}/desativar`, { schema: ExcecaoSaida }),
    onSuccess: () => invalidar(qc),
  })
}

export type { Horario, Agendamento, Excecao }
