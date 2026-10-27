// Dados da curadoria. Toda query parametrizada e filtrada por loja_id do escopo. Sem DELETE (grant
// inexistente): "remover" documento = arquivar. A api nunca escreve chunks (so le a contagem).
import { createHash } from 'node:crypto'
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'

export type TipoDoc = 'descricao' | 'regra' | 'faq' | 'politica'

export interface DocumentoRow {
  id: string
  tipo: TipoDoc
  titulo: string
  conteudo: string
  status: 'rascunho' | 'aprovado' | 'arquivado'
  origem: 'manual' | 'importado' | 'realimentado'
  versao: number
  substitui_id: string | null
  fonte_conversa_id: string | null
  fonte_mensagem_id: string | null
  aprovado_em: Date | null
  criado_em: Date
  atualizado_em: Date
  chunks_indexados: number
  duplicado_de: string | null
}

/** sha256 hex do conteudo normalizado (minusculo, espacos colapsados): chave de dedup. */
export function hashConteudo(conteudo: string): string {
  const norm = conteudo.toLowerCase().replace(/\s+/g, ' ').trim()
  return createHash('sha256').update(norm).digest('hex')
}

const COLUNAS = sql`d.id, d.tipo, d.titulo, d.conteudo, d.status, d.origem, d.versao, d.substitui_id,
  d.fonte_conversa_id, d.fonte_mensagem_id, d.aprovado_em, d.criado_em, d.atualizado_em,
  (select count(*)::int from public.chunks c where c.documento_id = d.id) as chunks_indexados,
  (select o.id from public.documentos o
     where o.loja_id = d.loja_id and o.id <> d.id and o.hash_conteudo = d.hash_conteudo
       and o.status in ('rascunho', 'aprovado') and d.status <> 'arquivado'
       and o.id is distinct from d.substitui_id
     order by o.criado_em limit 1) as duplicado_de`

export async function obterDocumento(
  exec: Executor,
  lojaId: string,
  id: string,
  travar = false,
): Promise<DocumentoRow | null> {
  // A trava vai na linha crua (subselects de agregacao nao aceitam FOR UPDATE).
  if (travar) {
    await consultar(exec, sql`select 1 from public.documentos where loja_id = ${lojaId} and id = ${id} for update`)
  }
  return consultarUm<DocumentoRow>(
    exec,
    sql`select ${COLUNAS} from public.documentos d where d.loja_id = ${lojaId} and d.id = ${id}`,
  )
}

export async function listarDocumentos(
  exec: Executor,
  lojaId: string,
  f: { status?: string | undefined; tipo?: string | undefined; limite: number },
): Promise<DocumentoRow[]> {
  return consultar<DocumentoRow>(
    exec,
    sql`select ${COLUNAS} from public.documentos d
        where d.loja_id = ${lojaId}
          and (${f.status ?? null}::documento_status is null or d.status = ${f.status ?? null}::documento_status)
          and (${f.tipo ?? null}::documento_tipo is null or d.tipo = ${f.tipo ?? null}::documento_tipo)
        order by d.atualizado_em desc, d.id
        limit ${f.limite}`,
  )
}

/** Cadeia de versoes (antecessores e sucessores) do documento, da mais antiga a mais nova. */
export async function versoesDoDocumento(exec: Executor, lojaId: string, id: string): Promise<DocumentoRow[]> {
  return consultar<DocumentoRow>(
    exec,
    sql`with recursive
          antes as (
            select id, substitui_id from public.documentos where loja_id = ${lojaId} and id = ${id}
            union
            select d.id, d.substitui_id from public.documentos d join antes a on d.id = a.substitui_id
            where d.loja_id = ${lojaId}
          ),
          depois as (
            select id, substitui_id from public.documentos where loja_id = ${lojaId} and id = ${id}
            union
            select d.id, d.substitui_id from public.documentos d join depois a on d.substitui_id = a.id
            where d.loja_id = ${lojaId}
          ),
          cadeia as (select id from antes union select id from depois)
        select ${COLUNAS} from public.documentos d join cadeia c on c.id = d.id
        where d.loja_id = ${lojaId}
        order by d.versao, d.criado_em`,
  )
}

export async function inserirDocumento(
  exec: Executor,
  lojaId: string,
  d: {
    tipo: string
    titulo: string
    conteudo: string
    origem: 'manual' | 'realimentado'
    versao?: number
    substituiId?: string | null
    fonteConversaId?: string | null
    fonteMensagemId?: string | null
    userId: string
  },
): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.documentos
          (loja_id, tipo, titulo, conteudo, status, origem, versao, substitui_id,
           fonte_conversa_id, fonte_mensagem_id, hash_conteudo, criado_por)
        values (${lojaId}, ${d.tipo}::documento_tipo, ${d.titulo}, ${d.conteudo}, 'rascunho',
          ${d.origem}::documento_origem, ${d.versao ?? 1}, ${d.substituiId ?? null},
          ${d.fonteConversaId ?? null}, ${d.fonteMensagemId ?? null}, ${hashConteudo(d.conteudo)}, ${d.userId})
        returning id`,
  )
  return r!.id
}

export async function atualizarRascunho(
  exec: Executor,
  lojaId: string,
  id: string,
  p: { tipo: string; titulo: string; conteudo: string },
): Promise<void> {
  await consultar(
    exec,
    sql`update public.documentos
        set tipo = ${p.tipo}::documento_tipo, titulo = ${p.titulo}, conteudo = ${p.conteudo},
            hash_conteudo = ${hashConteudo(p.conteudo)}
        where loja_id = ${lojaId} and id = ${id} and status = 'rascunho'`,
  )
}

export async function marcarAprovado(exec: Executor, lojaId: string, id: string, userId: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.documentos set status = 'aprovado', aprovado_por = ${userId}, aprovado_em = now()
        where loja_id = ${lojaId} and id = ${id}`,
  )
}

export async function marcarArquivado(exec: Executor, lojaId: string, id: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.documentos set status = 'arquivado' where loja_id = ${lojaId} and id = ${id}`,
  )
}

/** Existe sucessor rascunho apontando para este documento? */
export async function sucessorPendente(exec: Executor, lojaId: string, id: string): Promise<boolean> {
  const r = await consultarUm(
    exec,
    sql`select 1 as x from public.documentos
        where loja_id = ${lojaId} and substitui_id = ${id} and status = 'rascunho'`,
  )
  return r !== null
}

/** Quais dos ids pertencem a loja (guarda de docs_esperados contra id de outro tenant). */
export async function idsDaLoja(exec: Executor, lojaId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const r = await consultar<{ id: string }>(
    exec,
    sql`select id from public.documentos where loja_id = ${lojaId} and id = any(${ids}::uuid[])`,
  )
  return new Set(r.map((x) => x.id))
}

/** Auditoria append-only sem PII (so ids e estado). */
export async function auditar(
  exec: Executor,
  lojaId: string,
  tipo: string,
  entidade: string,
  entidadeId: string,
  detalhes: Record<string, unknown>,
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${lojaId}, ${tipo}, ${entidade}, ${entidadeId}, 'loja', ${JSON.stringify(detalhes)}::jsonb)`,
  )
}

// ---------------------------------------------------------------- golden set
export interface AvaliacaoRow {
  id: string
  pergunta: string
  resposta_esperada: string | null
  docs_esperados: string[]
  tipo: TipoDoc | null
  ativo: boolean
  origem: string
  criado_em: Date
}
const COL_AV = sql`id, pergunta, resposta_esperada, docs_esperados, tipo, ativo, origem, criado_em`

export async function listarAvaliacoes(
  exec: Executor,
  lojaId: string,
  f: { ativo?: boolean | undefined; limite: number },
): Promise<AvaliacaoRow[]> {
  return consultar<AvaliacaoRow>(
    exec,
    sql`select ${COL_AV} from public.base_avaliacao
        where loja_id = ${lojaId} and (${f.ativo ?? null}::boolean is null or ativo = ${f.ativo ?? null}::boolean)
        order by criado_em desc, id limit ${f.limite}`,
  )
}

export async function obterAvaliacao(exec: Executor, lojaId: string, id: string): Promise<AvaliacaoRow | null> {
  return consultarUm<AvaliacaoRow>(
    exec,
    sql`select ${COL_AV} from public.base_avaliacao where loja_id = ${lojaId} and id = ${id}`,
  )
}

export async function inserirAvaliacao(
  exec: Executor,
  lojaId: string,
  a: { pergunta: string; resposta: string | null; docs: string[]; tipo: string | null },
): Promise<string> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.base_avaliacao (loja_id, pergunta, resposta_esperada, docs_esperados, tipo, origem)
        values (${lojaId}, ${a.pergunta}, ${a.resposta}, ${a.docs}::uuid[], ${a.tipo}::documento_tipo, 'semente')
        returning id`,
  )
  return r!.id
}

export async function gravarAvaliacao(exec: Executor, lojaId: string, a: AvaliacaoRow): Promise<void> {
  await consultar(
    exec,
    sql`update public.base_avaliacao
        set pergunta = ${a.pergunta}, resposta_esperada = ${a.resposta_esperada},
            docs_esperados = ${a.docs_esperados}::uuid[], tipo = ${a.tipo}::documento_tipo, ativo = ${a.ativo}
        where loja_id = ${lojaId} and id = ${a.id}`,
  )
}

// ---------------------------------------------------------------- feedback
export interface FeedbackRow {
  id: string
  conversa_id: string | null
  mensagem_id: string | null
  tipo: 'lacuna' | 'recorrente' | 'correcao_humana'
  texto: string
  ocorrencias: number
  status: 'novo' | 'triado' | 'promovido' | 'descartado'
  documento_rascunho_id: string | null
  criado_em: Date
}
const COL_FB = sql`id, conversa_id, mensagem_id, tipo, texto, ocorrencias, status, documento_rascunho_id, criado_em`

export async function listarFeedback(
  exec: Executor,
  lojaId: string,
  f: { status?: string | undefined; limite: number },
): Promise<FeedbackRow[]> {
  return consultar<FeedbackRow>(
    exec,
    sql`select ${COL_FB} from public.rag_feedback
        where loja_id = ${lojaId}
          and (${f.status ?? null}::rag_feedback_status is null or status = ${f.status ?? null}::rag_feedback_status)
        order by ocorrencias desc, criado_em desc, id limit ${f.limite}`,
  )
}

export async function obterFeedback(
  exec: Executor,
  lojaId: string,
  id: string,
  travar = false,
): Promise<FeedbackRow | null> {
  return consultarUm<FeedbackRow>(
    exec,
    travar
      ? sql`select ${COL_FB} from public.rag_feedback where loja_id = ${lojaId} and id = ${id} for update`
      : sql`select ${COL_FB} from public.rag_feedback where loja_id = ${lojaId} and id = ${id}`,
  )
}

export async function mudarStatusFeedback(
  exec: Executor,
  lojaId: string,
  id: string,
  status: FeedbackRow['status'],
  documentoId: string | null = null,
): Promise<void> {
  await consultar(
    exec,
    sql`update public.rag_feedback
        set status = ${status}::rag_feedback_status,
            documento_rascunho_id = coalesce(${documentoId}::uuid, documento_rascunho_id)
        where loja_id = ${lojaId} and id = ${id}`,
  )
}

/** Promove os feedbacks ligados a um rascunho que acabou de ser aprovado. */
export async function promoverFeedbackDoDocumento(exec: Executor, lojaId: string, docId: string): Promise<void> {
  await consultar(
    exec,
    sql`update public.rag_feedback set status = 'promovido'
        where loja_id = ${lojaId} and documento_rascunho_id = ${docId} and status in ('novo', 'triado')`,
  )
}
