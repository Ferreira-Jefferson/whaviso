// Camada de dados do modulo pessoas: chamadas a `api` REST + hooks TanStack Query.
// Estado de servidor 100% via React Query; dados so pelo apiClient (nunca supabase.from).
// A loja ativa vai no header x-loja-id (nunca no corpo). Este modulo NUNCA importa outro
// modulo. Raiz de cache ['pessoas']. Contratos: @/shared/contracts/_generated/pessoas.
//
// Mapa REAL do backend (backend/apps/api/src/modules/pessoas/routes.ts, prefixo /v1/pessoas):
//   GET   /pessoas                        lista { itens } (query: incluir_inativos=true|false)
//   POST  /pessoas                        cria pessoa -> PessoaSaida (201)
//   GET   /pessoas/:id                    detalhe { ...pessoa, escalas[] }
//   PATCH /pessoas/:id                    edita (nome/cargo/telefone/observacoes/ativo) -> PessoaSaida
//   GET   /pessoas/cargos                 lista cargos { itens }
//   POST  /pessoas/cargos                 cria cargo -> CargoSaida (201)
//   PATCH /pessoas/cargos/:id             edita cargo (nome/ativo) -> CargoSaida
//   POST  /pessoas/:id/escalas            cria linha de escala -> EscalaSaida (201)
//   PATCH /pessoas/escalas/:id            edita escala -> EscalaSaida
//   POST  /pessoas/escalas/:id/desativar  desativa escala -> EscalaSaida
// PII: o telefone da pessoa so sai MASCARADO (telefone_mascarado). A revelacao em claro
// (POST /:id/telefone/revelar, so dono/gerente) NAO e usada nesta tela por decisao de
// privacidade: o cadastro se faz sem reexibir o numero em claro.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiClient } from '@/shared/api_client'
import {
  CargoListaSaida,
  CargoSaida,
  EscalaSaida,
  PessoaDetalheSaida,
  PessoaListaSaida,
  PessoaSaida,
  type CargoNovo,
  type CargoPatch,
  type EscalaNova,
  type EscalaPatch,
  type PessoaNova,
  type PessoaPatch,
} from '@/shared/contracts/_generated/pessoas'

export const RAIZ = 'pessoas'

export type Pessoa = z.infer<typeof PessoaSaida>
export type PessoaDetalhe = z.infer<typeof PessoaDetalheSaida>
export type Cargo = z.infer<typeof CargoSaida>
export type Escala = z.infer<typeof EscalaSaida>
type PessoaLista = z.infer<typeof PessoaListaSaida>
type CargoLista = z.infer<typeof CargoListaSaida>

// ---------------------------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------------------------

/** GET /v1/pessoas: equipe da loja ativa. `incluirInativos` traz tambem as arquivadas. */
export function usePessoas(incluirInativos: boolean) {
  return useQuery({
    queryKey: [RAIZ, 'lista', incluirInativos],
    queryFn: ({ signal }) =>
      apiClient.get<PessoaLista>('/pessoas', {
        query: { incluir_inativos: incluirInativos ? 'true' : undefined },
        schema: PessoaListaSaida,
        signal,
      }),
  })
}

/** GET /v1/pessoas/:id: detalhe com as escalas (so quando ha um id selecionado). */
export function usePessoaDetalhe(id: string | null) {
  return useQuery({
    queryKey: [RAIZ, 'detalhe', id],
    enabled: id != null,
    queryFn: ({ signal }) =>
      apiClient.get<PessoaDetalhe>(`/pessoas/${id}`, { schema: PessoaDetalheSaida, signal }),
  })
}

/** POST /v1/pessoas: cadastra uma pessoa. Invalida a raiz. */
export function useCriarPessoa() {
  const qc = useQueryClient()
  return useMutation<Pessoa, Error, PessoaNova>({
    mutationFn: (body) => apiClient.post<Pessoa>('/pessoas', { body, schema: PessoaSaida }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

/** PATCH /v1/pessoas/:id: edita campos (ou arquiva/reativa com `ativo`). Invalida a raiz. */
export function useAtualizarPessoa() {
  const qc = useQueryClient()
  return useMutation<Pessoa, Error, { id: string; patch: PessoaPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<Pessoa>(`/pessoas/${id}`, { body: patch, schema: PessoaSaida }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

// ---------------------------------------------------------------------------------------------
// Cargos (funcoes)
// ---------------------------------------------------------------------------------------------

/** GET /v1/pessoas/cargos: cargos visiveis a loja (presets da plataforma + cargos proprios). */
export function useCargos() {
  return useQuery({
    queryKey: [RAIZ, 'cargos'],
    queryFn: ({ signal }) =>
      apiClient.get<CargoLista>('/pessoas/cargos', { schema: CargoListaSaida, signal }),
  })
}

/** POST /v1/pessoas/cargos: cria um cargo proprio da loja. Invalida a raiz. */
export function useCriarCargo() {
  const qc = useQueryClient()
  return useMutation<Cargo, Error, CargoNovo>({
    mutationFn: (body) => apiClient.post<Cargo>('/pessoas/cargos', { body, schema: CargoSaida }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

/** PATCH /v1/pessoas/cargos/:id: renomeia ou arquiva/reativa um cargo proprio. Invalida a raiz. */
export function useAtualizarCargo() {
  const qc = useQueryClient()
  return useMutation<Cargo, Error, { id: string; patch: CargoPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<Cargo>(`/pessoas/cargos/${id}`, { body: patch, schema: CargoSaida }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

// ---------------------------------------------------------------------------------------------
// Escalas (dias + horarios que a pessoa trabalha)
// ---------------------------------------------------------------------------------------------

/** POST /v1/pessoas/:id/escalas: adiciona uma linha de escala. Invalida a raiz (lista + detalhe). */
export function useCriarEscala() {
  const qc = useQueryClient()
  return useMutation<Escala, Error, { pessoaId: string; body: EscalaNova }>({
    mutationFn: ({ pessoaId, body }) =>
      apiClient.post<Escala>(`/pessoas/${pessoaId}/escalas`, { body, schema: EscalaSaida }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

/** PATCH /v1/pessoas/escalas/:id: edita uma linha de escala. Invalida a raiz. */
export function useAtualizarEscala() {
  const qc = useQueryClient()
  return useMutation<Escala, Error, { id: string; patch: EscalaPatch }>({
    mutationFn: ({ id, patch }) =>
      apiClient.patch<Escala>(`/pessoas/escalas/${id}`, { body: patch, schema: EscalaSaida }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}

/** POST /v1/pessoas/escalas/:id/desativar: remove uma linha da escala. Invalida a raiz. */
export function useDesativarEscala() {
  const qc = useQueryClient()
  return useMutation<Escala, Error, { id: string }>({
    mutationFn: ({ id }) =>
      apiClient.post<Escala>(`/pessoas/escalas/${id}/desativar`, { schema: EscalaSaida }),
    onSettled: () => void qc.invalidateQueries({ queryKey: [RAIZ] }),
  })
}
