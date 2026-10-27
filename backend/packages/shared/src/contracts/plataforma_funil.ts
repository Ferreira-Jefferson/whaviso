// Contratos de borda do modulo plataforma_funil (CRM de aquisicao da equipe Whaviso). Fonte unica;
// o codegen reemite para o front. Schemas Zod estritos (SEC-081). So operador acessa.
// O telefone do prospecto (PII de terceiro) so existe em claro na ENTRADA (cadastro/edicao) e no
// DETALHE (para o operador ligar). Listagens, quadro e agenda devolvem apenas a mascara.
import { z } from 'zod'
import { estagioProspecto, tipoAtividadeProspecto } from './enums'
import { Cursor, DataHoraIso, UuidSchema } from './primitivos'

const Uuid = UuidSchema
// Saida de data como string nao vazia (serializacao do banco; nao forca ISO estrito aqui).
const DataHora = z.string().min(1)
const texto = (max: number) => z.string().trim().min(1).max(max)

// ---------------------------------------------------------------------------------------------
// Prospectos
// ---------------------------------------------------------------------------------------------
export const ProspectoCriar = z.strictObject({
  nome_restaurante: texto(120),
  contato_nome: texto(120).optional(),
  // Shape aqui; a validacao BR (DDD, 9o digito) e do service (422 'telefone_invalido').
  contato_telefone: z.string().trim().min(1).max(30).optional(),
  contato_email: z.email().max(254).optional(),
  cidade: texto(80).optional(),
  origem: texto(80).optional(),
  observacoes: texto(4000).optional(),
  // Omitido: o responsavel e o operador que cadastra.
  responsavel_operador_id: Uuid.optional(),
})

/** PATCH parcial. Estagio e conta NAO entram aqui (rotas proprias). null limpa o campo. */
export const ProspectoPatch = z
  .strictObject({
    nome_restaurante: texto(120).optional(),
    contato_nome: texto(120).nullable().optional(),
    contato_telefone: z.string().trim().min(1).max(30).nullable().optional(),
    contato_email: z.email().max(254).nullable().optional(),
    cidade: texto(80).nullable().optional(),
    origem: texto(80).nullable().optional(),
    observacoes: texto(4000).nullable().optional(),
    responsavel_operador_id: Uuid.nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'informe ao menos um campo' })

export const ProspectoDTO = z.strictObject({
  id: Uuid,
  nome_restaurante: z.string(),
  contato_nome: z.string().nullable(),
  contato_telefone_mascarado: z.string().nullable(),
  contato_email: z.string().nullable(),
  cidade: z.string().nullable(),
  origem: z.string().nullable(),
  estagio: estagioProspecto,
  responsavel_operador_id: Uuid.nullable(),
  responsavel_nome: z.string().nullable(),
  conta_id: Uuid.nullable(),
  conta_nome: z.string().nullable(),
  observacoes: z.string().nullable(),
  criado_em: DataHora,
  atualizado_em: DataHora,
})

/** Detalhe: unico lugar que devolve o telefone em claro (operador liga para o contato). */
export const ProspectoDetalheDTO = ProspectoDTO.extend({
  contato_telefone: z.string().nullable(),
})

export const ProspectoListaQuery = z.strictObject({
  estagio: estagioProspecto.optional(),
  responsavel_id: Uuid.optional(),
  cidade: texto(80).optional(),
  q: texto(120).optional(),
  cursor: Cursor.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})

export const ProspectoPagina = z.strictObject({
  itens: z.array(ProspectoDTO),
  proximoCursor: z.string().nullable(),
})

/** Muda o estagio. `ativo` nao e aceito: so nasce do vinculo de conta. */
export const EstagioMudar = z.strictObject({
  estagio: estagioProspecto,
  motivo: texto(500).optional(),
})

export const VincularConta = z.strictObject({ conta_id: Uuid })

// ---------------------------------------------------------------------------------------------
// Atividades (append-only). Concluir follow-up = nova atividade que referencia a anterior.
// ---------------------------------------------------------------------------------------------
export const AtividadeCriar = z
  .strictObject({
    tipo: tipoAtividadeProspecto,
    descricao: texto(2000).optional(),
    // Follow-up: data/hora marcada (ISO 8601). Outros tipos nao tem agendamento.
    agendada_para: DataHoraIso.optional(),
    // Id do follow-up que esta atividade conclui.
    conclui_atividade_id: z.number().int().positive().optional(),
  })
  .superRefine((o, ctx) => {
    if (o.tipo === 'follow_up' && !o.agendada_para) {
      ctx.addIssue({ code: 'custom', path: ['agendada_para'], message: 'follow-up exige agendada_para' })
    }
    if (o.tipo !== 'follow_up' && o.agendada_para) {
      ctx.addIssue({ code: 'custom', path: ['agendada_para'], message: 'so follow-up tem agendamento' })
    }
    if (o.conclui_atividade_id !== undefined && o.tipo === 'follow_up') {
      ctx.addIssue({ code: 'custom', path: ['tipo'], message: 'conclusao nao pode ser um novo follow-up' })
    }
    if (o.tipo === 'nota' && !o.descricao) {
      ctx.addIssue({ code: 'custom', path: ['descricao'], message: 'nota exige descricao' })
    }
  })

export const AtividadeDTO = z.strictObject({
  id: z.number().int(),
  prospecto_id: Uuid,
  operador_id: Uuid.nullable(),
  operador_nome: z.string().nullable(),
  tipo: tipoAtividadeProspecto,
  descricao: z.string().nullable(),
  agendada_para: DataHora.nullable(),
  // Preenchido quando esta atividade conclui um follow-up.
  conclui_atividade_id: z.number().int().nullable(),
  criado_em: DataHora,
})

export const AtividadeListaQuery = z.strictObject({
  cursor: Cursor.optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})

export const AtividadePagina = z.strictObject({
  itens: z.array(AtividadeDTO),
  proximoCursor: z.string().nullable(),
})

// ---------------------------------------------------------------------------------------------
// Quadro (kanban) e agenda
// ---------------------------------------------------------------------------------------------
export const QuadroQuery = z.strictObject({
  limite_por_estagio: z.coerce.number().int().min(1).max(50).default(10),
})

export const FunilQuadro = z.strictObject({
  colunas: z.array(
    z.strictObject({
      estagio: estagioProspecto,
      total: z.number().int().nonnegative(),
      itens: z.array(ProspectoDTO),
    }),
  ),
})

export const AgendaQuery = z.strictObject({
  // Janela em dias a partir de hoje (America/Sao_Paulo); atrasados sempre entram.
  dias: z.coerce.number().int().min(0).max(90).default(7),
  responsavel_id: Uuid.optional(),
  // Todos os responsaveis (ignora responsavel_id). Default: o operador logado.
  todos: z.enum(['true', 'false']).optional(),
})

export const AgendaFollowUp = z.strictObject({
  atividade_id: z.number().int(),
  prospecto_id: Uuid,
  nome_restaurante: z.string(),
  estagio: estagioProspecto,
  responsavel_operador_id: Uuid.nullable(),
  descricao: z.string().nullable(),
  agendada_para: DataHora,
  atrasado: z.boolean(),
})
export const AgendaFollowUpLista = z.strictObject({ itens: z.array(AgendaFollowUp) })

export type ProspectoNovo = z.infer<typeof ProspectoCriar>
export type ProspectoAtualizacao = z.infer<typeof ProspectoPatch>
export type ProspectoDto = z.infer<typeof ProspectoDTO>
export type ProspectoDetalheDto = z.infer<typeof ProspectoDetalheDTO>
export type ProspectoFiltros = z.infer<typeof ProspectoListaQuery>
export type EstagioMudarEntrada = z.infer<typeof EstagioMudar>
export type AtividadeNova = z.infer<typeof AtividadeCriar>
export type AtividadeDto = z.infer<typeof AtividadeDTO>
export type FunilQuadroDto = z.infer<typeof FunilQuadro>
export type AgendaFollowUpDto = z.infer<typeof AgendaFollowUp>
