// Linhas do banco (Date) -> DTOs de borda (ISO 8601 UTC).
import type { AvaliacaoRow, DocumentoRow, FeedbackRow } from './repo'

const iso = (d: Date) => d.toISOString()

export const docDto = (d: DocumentoRow) => ({
  id: d.id,
  tipo: d.tipo,
  titulo: d.titulo,
  conteudo: d.conteudo,
  status: d.status,
  origem: d.origem,
  versao: d.versao,
  substitui_id: d.substitui_id,
  fonte_conversa_id: d.fonte_conversa_id,
  fonte_mensagem_id: d.fonte_mensagem_id,
  aprovado_em: d.aprovado_em ? iso(d.aprovado_em) : null,
  criado_em: iso(d.criado_em),
  atualizado_em: iso(d.atualizado_em),
  chunks_indexados: d.chunks_indexados,
  duplicado_de: d.duplicado_de,
})

export const avaliacaoDto = (a: AvaliacaoRow) => ({
  id: a.id,
  pergunta: a.pergunta,
  resposta_esperada: a.resposta_esperada,
  docs_esperados: a.docs_esperados,
  tipo: a.tipo,
  ativo: a.ativo,
  origem: a.origem,
  criado_em: iso(a.criado_em),
})

export const feedbackDto = (f: FeedbackRow) => ({
  id: f.id,
  tipo: f.tipo,
  texto: f.texto,
  ocorrencias: f.ocorrencias,
  status: f.status,
  documento_rascunho_id: f.documento_rascunho_id,
  criado_em: iso(f.criado_em),
})
