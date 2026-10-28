// Retriever hibrido escopado por loja: a UNICA porta de leitura da base de conhecimento (RAG.md 2).
//
// Isolamento (RAG-ISO-001 / SEC-062): TODA sub-consulta pre-filtra `where loja_id = $1` ANTES do
// ranqueamento, e o join final repete o filtro (defesa em profundidade). Um trecho de outra loja
// nunca e sequer candidato, mesmo que dois restaurantes tenham o mesmo prato. O `loja_id` vem SEMPRE
// da conversa resolvida no servidor, nunca de texto do cliente nem da saida do modelo.
//
// Hibrido: distancia cosseno (pgvector HNSW) + BM25 (`ts_rank` sobre `tsvector` portuguese), fundidos
// por Reciprocal Rank Fusion (RRF opera sobre posicao de rank, dispensa normalizar score; peso menor
// ao esparso, RAG.md 2). Sem a extensao `vector` (ex.: Postgres local de teste), degrada para BM25
// sozinho: o isolamento e a montagem de contexto nao mudam, so o sinal de recuperacao.
import { consultar, consultarUm, sql, type Consulta, type Executor } from '@whaviso/shared/db'
import type { ClienteEmbeddings } from './embeddings'
import type { ClienteReranker } from './reranker'
import type { TrechoRecuperado } from './tipos'

/** Constante k do RRF (padrao da literatura). Amortece o peso das posicoes mais baixas. */
export const RRF_K = 60
/** Candidatos por sinal antes da fusao. */
export const K_CANDIDATOS = 8
/** Trechos no contexto final (janela do WhatsApp e curta; menos ruido = menos superficie de injecao). */
export const CONTEXTO_PADRAO = 4
/** Peso do sinal esparso (BM25) no RRF; o denso (vetor) vale 1. Ponto de partida, calibrar na avaliacao. */
export const PESO_LEXICO = 0.25
export const PESO_VETOR = 1.0

export interface DepsRetriever {
  exec: Executor
  embeddings: ClienteEmbeddings
  reranker: ClienteReranker
}

export interface BuscaEntrada {
  /** Resolvido no servidor a partir da conversa; NUNCA de entrada do cliente (SEC-002/062). */
  lojaId: string
  /** Consulta ja reescrita por `entender_mensagem` (turno + ultimas mensagens). */
  consulta: string
  k?: number
  contexto?: number
}

/** Cache por processo: a extensao `vector` existe neste banco? (a conexao e fixa por processo). */
let vetorCache: Promise<boolean> | undefined
export function vetorDisponivel(exec: Executor): Promise<boolean> {
  if (!vetorCache) {
    vetorCache = consultarUm<{ existe: boolean }>(
      exec,
      sql`select exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'chunks'
                            and column_name = 'embedding') as existe`,
    ).then((r) => r?.existe ?? false)
  }
  return vetorCache
}

/** So para teste: zera o cache de deteccao do vetor. */
export function _resetVetorCache(): void {
  vetorCache = undefined
}

/** Literal de vetor pgvector (`[v1,v2,...]`) a partir de um array de numeros. */
function literalVetor(v: readonly number[]): string {
  return `[${v.join(',')}]`
}

interface LinhaTrecho {
  chunk_id: string
  documento_id: string
  texto: string
  origem: string
  pontuacao: number
}

const SELECT_FINAL = sql`c.id as chunk_id, c.documento_id,
    coalesce(c.texto_contextualizado, c.texto) as texto, d.origem::text as origem`

// tsquery com semantica OR: `plainto_tsquery` ja sanitiza/quota os lexemes (seguro contra injecao);
// so reescrevemos o operador & para | para que o BM25 aceite sobreposicao parcial de termos (recall
// melhor no corpus curto, sobretudo no modo degradado sem o braco vetorial).
const TSQUERY = (consulta: string): Consulta =>
  sql`replace(plainto_tsquery('portuguese', ${consulta})::text, '&', '|')::tsquery`

/** Consulta BM25 sozinha (modo degradado, sem pgvector). Pre-filtra loja em todo lugar. */
function consultaLexical(lojaId: string, consulta: string, contexto: number): Consulta {
  return sql`
    with q as (select ${TSQUERY(consulta)} as query)
    select ${SELECT_FINAL}, ts_rank(c.tsv, q.query) as pontuacao
      from public.chunks c
      join public.documentos d
        on d.id = c.documento_id and d.loja_id = c.loja_id and d.status = 'aprovado'
      cross join q
     where c.loja_id = ${lojaId} and c.tsv @@ q.query
     order by pontuacao desc, c.id
     limit ${contexto}`
}

/** Consulta hibrida vetor + BM25 fundidos por RRF. Pre-filtra loja em CADA sub-select e no join final. */
function consultaHibrida(lojaId: string, consulta: string, qvec: string, k: number, contexto: number): Consulta {
  return sql`
    with q as (select ${TSQUERY(consulta)} as query),
    lexical as (
      select c.id, row_number() over (order by ts_rank(c.tsv, q.query) desc, c.id) as rnk
        from public.chunks c cross join q
       where c.loja_id = ${lojaId} and c.tsv @@ q.query
       order by ts_rank(c.tsv, q.query) desc, c.id
       limit ${k}
    ),
    vetor as (
      select c.id, row_number() over (order by c.embedding <=> ${qvec}::vector, c.id) as rnk
        from public.chunks c
       where c.loja_id = ${lojaId} and c.embedding is not null
       order by c.embedding <=> ${qvec}::vector, c.id
       limit ${k}
    ),
    fundido as (
      select id, sum(score) as score from (
        -- Os pesos vao como parametro; sem o ::float8 o Postgres infere o tipo do numerador
        -- pelo rnk (bigint, de row_number) e rejeita 0.25 ("invalid input syntax for bigint").
        select id, ${PESO_VETOR}::float8 / (${RRF_K} + rnk) as score from vetor
        union all
        select id, ${PESO_LEXICO}::float8 / (${RRF_K} + rnk) as score from lexical
      ) u group by id
    )
    select ${SELECT_FINAL}, f.score as pontuacao
      from fundido f
      join public.chunks c on c.id = f.id
      join public.documentos d
        on d.id = c.documento_id and d.loja_id = c.loja_id and d.status = 'aprovado'
     where c.loja_id = ${lojaId}
     order by f.score desc, c.id
     limit ${contexto}`
}

/**
 * Recupera os trechos de conhecimento mais relevantes da loja para a consulta. Uma passada hibrida
 * (sem multi-hop, RAG.md 6): embute a consulta (credencial da plataforma), funde vetor + BM25 por RRF,
 * reordena (reranker nulo por padrao) e devolve o contexto final. Escopo sempre por `lojaId`.
 */
export async function buscarConhecimento(deps: DepsRetriever, entrada: BuscaEntrada): Promise<TrechoRecuperado[]> {
  const contexto = entrada.contexto ?? CONTEXTO_PADRAO
  const k = entrada.k ?? K_CANDIDATOS
  const temVetor = await vetorDisponivel(deps.exec)

  let consulta: Consulta
  if (temVetor) {
    const r = await deps.embeddings.embutir({ exec: deps.exec, lojaId: entrada.lojaId, textos: [entrada.consulta] })
    // Falha de embedding (credencial ausente, provedor fora): degrada para BM25, nao quebra o atendimento.
    const qvec = r.ok ? r.valor.vetores[0] : undefined
    consulta = qvec && qvec.length > 0
      ? consultaHibrida(entrada.lojaId, entrada.consulta, literalVetor(qvec), k, contexto)
      : consultaLexical(entrada.lojaId, entrada.consulta, contexto)
  } else {
    consulta = consultaLexical(entrada.lojaId, entrada.consulta, contexto)
  }

  const linhas = await consultar<LinhaTrecho>(deps.exec, consulta)
  const trechos: TrechoRecuperado[] = linhas.map((l) => ({
    chunkId: l.chunk_id,
    documentoId: l.documento_id,
    texto: l.texto,
    origem: l.origem,
    pontuacao: Number(l.pontuacao),
  }))
  return deps.reranker.rerank(entrada.consulta, trechos)
}
