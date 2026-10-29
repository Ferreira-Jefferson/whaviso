// Ingestor: transforma um documento APROVADO em chunks embeddados e indexados (RAG.md 2). Disparado
// pela aprovacao do dono (evento de outbox de API-conhecimento); este kernel so executa a ingestao.
//
// Pipeline: ler documento -> validar (barra dado vivo/PII/segredo) -> chunk por unidade logica ->
// contextualizar (opcional, ClienteLLM da loja; sem credencial, ingere sem prefixo) -> embeddar
// (credencial da PLATAFORMA; sem pgvector, ingere sem vetor) -> gravar chunks com loja_id desnormalizado.
// Reindexacao = apagar os chunks do documento e reinserir (idempotente por documento).
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { escopoLoja } from '../escopo'
import { chunkPorUnidadeLogica } from './chunking'
import type { ClienteEmbeddings } from './embeddings'
import { vetorDisponivel } from './retriever'
import { comTx } from './tx'
import { validarConteudoConhecimento } from './validador'
import type { ChunkBruto, DocumentoParaIngestao } from './tipos'

/** Gera a linha de contexto do Contextual Retrieval para um chunk, ou null se nao houver como. */
export type Contextualizador = (
  doc: DocumentoParaIngestao,
  chunk: ChunkBruto,
) => Promise<string | null>

export interface DepsIngestor {
  exec: Executor
  embeddings: ClienteEmbeddings
  logger: Logger
  /** Opcional: sem contextualizador, os chunks entram sem prefixo (texto_contextualizado = null). */
  contextualizador?: Contextualizador
}

export interface ResultadoIngestao {
  documentoId: string
  chunks: number
  comVetor: boolean
  /** Preenchido quando a ingestao foi pulada (ex.: documento nao aprovado, ou cheira a dado vivo). */
  pulado?: 'nao_aprovado' | 'dado_vivo' | 'vazio'
}

interface LinhaDocumento {
  loja_id: string
  tipo: DocumentoParaIngestao['tipo']
  titulo: string
  conteudo: string
  status: string
}

function estimarTokens(s: string): number {
  return Math.max(1, Math.ceil(s.length / 4))
}

function literalVetor(v: readonly number[]): string {
  return `[${v.join(',')}]`
}

/**
 * Ingere um documento aprovado. So indexa `status='aprovado'`; barra dado vivo por construcao
 * (RAG.md 3). Reindexa apagando os chunks anteriores do documento. Nunca lanca por falha de
 * embedding/contextualizacao: degrada (ingere sem vetor/prefixo) e segue.
 */
export async function ingerirDocumento(deps: DepsIngestor, documentoId: string): Promise<ResultadoIngestao> {
  const doc = await consultarUm<LinhaDocumento>(
    deps.exec,
    sql`select loja_id, tipo, titulo, conteudo, status from public.documentos where id = ${documentoId}`,
  )
  if (!doc) return { documentoId, chunks: 0, comVetor: false, pulado: 'vazio' }
  if (doc.status !== 'aprovado') return { documentoId, chunks: 0, comVetor: false, pulado: 'nao_aprovado' }

  // Trava: nao indexa documento que cheire a dado vivo/PII/segredo (defesa mesmo apos aprovacao).
  const validacao = validarConteudoConhecimento(doc.conteudo)
  if (!validacao.ok) {
    deps.logger.warn({ documento_id: documentoId, motivos: validacao.motivos }, 'ingestao barrada: dado vivo/sensivel')
    return { documentoId, chunks: 0, comVetor: false, pulado: 'dado_vivo' }
  }

  const docIng: DocumentoParaIngestao = {
    id: documentoId,
    lojaId: doc.loja_id,
    tipo: doc.tipo,
    titulo: doc.titulo,
    conteudo: doc.conteudo,
  }
  const brutos = chunkPorUnidadeLogica(docIng)
  if (brutos.length === 0) return { documentoId, chunks: 0, comVetor: false, pulado: 'vazio' }

  // Contextualizacao : prefixa cada chunk com uma linha de contexto; falha => sem prefixo.
  const contextos = await Promise.all(
    brutos.map(async (c) => {
      if (!deps.contextualizador) return null
      try {
        return await deps.contextualizador(docIng, c)
      } catch {
        return null
      }
    }),
  )
  const paraEmbutir = brutos.map((c, i) => (contextos[i] ? `${contextos[i]}\n${c.texto}` : c.texto))

  // Embedding pela credencial da PLATAFORMA; so quando ha pgvector. Falha => ingere sem vetor.
  const temVetor = await vetorDisponivel(deps.exec)
  let vetores: number[][] | undefined
  if (temVetor) {
    const r = await deps.embeddings.embutir({ exec: deps.exec, escopo: escopoLoja(doc.loja_id), textos: paraEmbutir })
    if (r.ok) vetores = r.valor.vetores
    else deps.logger.warn({ documento_id: documentoId }, 'embedding indisponivel: chunks sem vetor')
  }

  // Reindexacao atomica: apaga os chunks anteriores e reinsere em um unico insert (unnest), na mesma
  // transacao (falha no meio nao deixa chunks parciais). Idempotente por documento.
  const ordens = brutos.map((c) => c.ordem)
  const textos = brutos.map((c) => c.texto)
  const ctxs = brutos.map((_, i) => contextos[i] ?? null)
  const tokens = brutos.map((_, i) => estimarTokens(paraEmbutir[i]!))
  const modelos = brutos.map((_, i) => (vetores?.[i] ? deps.embeddings.modelo : null))
  const vetLiterais = brutos.map((_, i) => {
    const vet = vetores?.[i]
    return vet && vet.length > 0 ? literalVetor(vet) : null
  })
  await comTx(deps.exec, async (tx) => {
    await consultar(tx, sql`delete from public.chunks where documento_id = ${documentoId}`)
    if (temVetor) {
      await consultar(
        tx,
        sql`insert into public.chunks
              (documento_id, loja_id, ordem, texto, texto_contextualizado, embedding_model, token_count, embedding)
            select ${documentoId}, ${doc.loja_id}, u.ordem, u.texto, u.ctx, u.modelo, u.tokens, u.vec::vector
              from unnest(${ordens}::int[], ${textos}::text[], ${ctxs}::text[], ${modelos}::text[],
                          ${tokens}::int[], ${vetLiterais}::text[])
                   as u(ordem, texto, ctx, modelo, tokens, vec)`,
      )
    } else {
      // Sem pgvector: insere sem referenciar a coluna embedding (ela nem existe no banco local).
      await consultar(
        tx,
        sql`insert into public.chunks
              (documento_id, loja_id, ordem, texto, texto_contextualizado, embedding_model, token_count)
            select ${documentoId}, ${doc.loja_id}, u.ordem, u.texto, u.ctx, u.modelo, u.tokens
              from unnest(${ordens}::int[], ${textos}::text[], ${ctxs}::text[], ${modelos}::text[],
                          ${tokens}::int[])
                   as u(ordem, texto, ctx, modelo, tokens)`,
      )
    }
  })

  return { documentoId, chunks: brutos.length, comVetor: Boolean(vetores) }
}
