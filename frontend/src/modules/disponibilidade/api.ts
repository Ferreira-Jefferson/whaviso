// Camada de dados do modulo disponibilidade: quando a loja atende e aceita pedidos.
// Estado de servidor via TanStack Query; dados so pelo api_client (prefixo /v1 + /disponibilidade).
// Raiz de cache ['disponibilidade']: qualquer escrita a invalida (lista + estado "aceitando agora").
// Horas sao locais (America/Sao_Paulo): o backend decide; a tela so edita o cadastro.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/shared/api_client'
import {
  DisponibilidadeAgoraSaida,
  ExcecaoListaSaida,
  ExcecaoSaida,
  HorarioListaSaida,
  HorarioSaida,
  JanelaAtendenteGetSaida,
  JanelaAtendenteSaida,
  type ExcecaoEntrada,
  type ExcecaoSaida as Excecao,
  type HorarioEntrada,
  type HorarioPatch,
  type HorarioSaida as Horario,
  type JanelaAtendenteEntrada,
  type JanelaAtendenteSaida as Janela,
} from '@/shared/contracts/_generated/disponibilidade'

export const RAIZ = 'disponibilidade'
const BASE = '/disponibilidade'

interface ListaHorarios {
  itens: Horario[]
}
interface ListaExcecoes {
  itens: Excecao[]
}
interface JanelaGet {
  janela: Janela | null
}

function invalidar(qc: ReturnType<typeof useQueryClient>) {
  // Uma escrita em qualquer secao muda o derivado "aceitando agora": invalida a raiz toda.
  void qc.invalidateQueries({ queryKey: [RAIZ] })
}

// --- Estado derivado: a loja esta aceitando agora? (calculado no servidor) ---
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

// --- Horarios de funcionamento (varias faixas por dia) ---
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

// --- Janela do atendente (IA): fora dela o atendente nao responde ---
/** GET /v1/disponibilidade/janela: `janela` e null quando ainda nao foi configurada. */
export function useJanela() {
  return useQuery({
    queryKey: [RAIZ, 'janela'],
    queryFn: ({ signal }) =>
      apiClient.get<JanelaGet>(`${BASE}/janela`, { schema: JanelaAtendenteGetSaida, signal }),
    select: (d) => d.janela,
  })
}

/** PUT /v1/disponibilidade/janela: define (substitui) a janela do atendente. */
export function useDefinirJanela() {
  const qc = useQueryClient()
  return useMutation<Janela, Error, JanelaAtendenteEntrada>({
    mutationFn: (body) => apiClient.put<Janela>(`${BASE}/janela`, { body, schema: JanelaAtendenteSaida }),
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

export type { Horario, Janela, Excecao }
