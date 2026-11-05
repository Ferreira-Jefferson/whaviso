// Contratos de borda do suporte com acesso assistido (fonte unica; o codegen reemite para o
// front). Schemas Zod estritos (SEC-081): z.strictObject, tamanhos e enums fechados.
//
// Dois lados compartilham estes contratos:
//  - LOJA (`/v1/suporte`): o dono/gerente abre chamado, troca mensagens e concede/revoga um
//    acesso assistido temporario (consentimento) a equipe Whaviso.
//  - CONSOLE (`/v1/plataforma-suporte`): o operador ve a fila de chamados de todas as lojas,
//    responde, e consulta se ha consentimento ativo (nunca concede nem revoga).
//
// A loja efetiva vem SEMPRE do escopo (header `x-loja-id`) ou de parametro de ROTA no console,
// NUNCA do corpo (SEC-002): por isso nenhum schema de ENTRADA carrega `loja_id`.
import { z } from 'zod'
import { DataHoraIso, UuidSchema } from './primitivos'

// ------------------------------------------------------------------ enums
/** Estado do chamado. Transicoes: abrir->aberto; loja responde->aberto; operador responde->
 *  respondido; loja encerra->resolvido. */
export const statusChamado = z.enum(['aberto', 'respondido', 'resolvido'])
export type StatusChamado = z.infer<typeof statusChamado>

/** Quem escreveu a mensagem do chamado. */
export const autorChamado = z.enum(['loja', 'operador'])
export type AutorChamado = z.infer<typeof autorChamado>

// ------------------------------------------------------------------ chamados (saida)
export const ChamadoResumo = z.strictObject({
  id: UuidSchema,
  loja_id: UuidSchema,
  assunto: z.string(),
  status: statusChamado,
  criado_em: DataHoraIso,
  atualizado_em: DataHoraIso,
})
export type ChamadoResumo = z.infer<typeof ChamadoResumo>

export const ChamadoMensagem = z.strictObject({
  id: UuidSchema,
  chamado_id: UuidSchema,
  autor_tipo: autorChamado,
  autor_user_id: UuidSchema,
  texto: z.string(),
  criado_em: DataHoraIso,
})
export type ChamadoMensagem = z.infer<typeof ChamadoMensagem>

/** Detalhe do chamado com o fio de mensagens em ordem cronologica. */
export const ChamadoFicha = z.strictObject({
  chamado: ChamadoResumo,
  mensagens: z.array(ChamadoMensagem),
})
export type ChamadoFicha = z.infer<typeof ChamadoFicha>

export const ListaChamados = z.strictObject({ itens: z.array(ChamadoResumo) })
export type ListaChamados = z.infer<typeof ListaChamados>

/** Fila paginada do console (cursor opaco). */
export const ChamadoPagina = z.strictObject({
  itens: z.array(ChamadoResumo),
  proximoCursor: z.string().nullable(),
})
export type ChamadoPagina = z.infer<typeof ChamadoPagina>

// ------------------------------------------------------------------ chamados (entrada)
/** Abre um chamado: assunto + a primeira mensagem (sem loja_id, vem do escopo). */
export const NovoChamado = z.strictObject({
  assunto: z.string().trim().min(1).max(160),
  mensagem: z.string().trim().min(1).max(4000),
})
export type NovoChamado = z.infer<typeof NovoChamado>

/** Nova mensagem num chamado existente. */
export const NovaMensagem = z.strictObject({
  texto: z.string().trim().min(1).max(4000),
})
export type NovaMensagem = z.infer<typeof NovaMensagem>

/** Transicao de status disponivel para a loja: encerrar o chamado. */
export const PatchChamado = z.strictObject({
  status: z.literal('resolvido'),
})
export type PatchChamado = z.infer<typeof PatchChamado>

// ------------------------------------------------------------------ fila do console
/** Consulta da fila do console: filtro de status e paginacao por cursor. */
export const SuporteChamadosQuery = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
  status: statusChamado.optional(),
})
export type SuporteChamadosQuery = z.infer<typeof SuporteChamadosQuery>

// ------------------------------------------------------------------ acesso assistido
/** Grant de acesso assistido. `ativo` = derivado (revogado_em null e now < expira_em). */
export const AcessoSuporte = z.strictObject({
  id: UuidSchema,
  loja_id: UuidSchema,
  chamado_id: UuidSchema.nullable(),
  concedido_por: UuidSchema,
  motivo: z.string().nullable(),
  criado_em: DataHoraIso,
  expira_em: DataHoraIso,
  revogado_em: DataHoraIso.nullable(),
  revogado_por: UuidSchema.nullable(),
  ativo: z.boolean(),
})
export type AcessoSuporte = z.infer<typeof AcessoSuporte>

export const ListaAcessos = z.strictObject({ itens: z.array(AcessoSuporte) })
export type ListaAcessos = z.infer<typeof ListaAcessos>

/** Duracao maxima de um acesso assistido: 7 dias (168 horas). */
export const DURACAO_ACESSO_MAX_HORAS = 168

/**
 * Concede um acesso assistido. A loja informa a janela por `duracao_horas` (preferido) OU por
 * `expira_em` (ISO, UTC) explicito; exatamente um dos dois. `motivo` e opcional; `chamado_id`
 * vincula o acesso a um chamado (opcional). Sem `loja_id`: vem do escopo (SEC-002).
 */
export const NovoAcesso = z
  .strictObject({
    motivo: z.string().trim().min(1).max(400).optional(),
    duracao_horas: z.number().int().min(1).max(DURACAO_ACESSO_MAX_HORAS).optional(),
    expira_em: DataHoraIso.optional(),
    chamado_id: UuidSchema.optional(),
  })
  .refine((v) => (v.duracao_horas === undefined) !== (v.expira_em === undefined), {
    message: 'informe duracao_horas OU expira_em (exatamente um)',
  })
export type NovoAcesso = z.infer<typeof NovoAcesso>
