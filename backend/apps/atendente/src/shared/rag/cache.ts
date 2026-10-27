// Cache semantico TRAVADO (RAG.md 6). Economiza a chave da loja em perguntas repetidas de resposta
// ESTAVEL (horario, formas de pagamento, "fazem entrega?"), com tres travas que impedem servir dado
// velho com confianca:
//   1. namespace por loja: o lookup SEMPRE carrega loja_id (cache de A nunca serve B, SEC-062);
//   2. classificacao da pergunta/resposta antes de gravar E antes de servir (validador de dado vivo):
//      resposta com preco/disponibilidade/status NUNCA e cacheada; invariante contem_dado_vivo=false;
//   3. similaridade ALTA (0.97+): pergunta negada/invertida fica perto no espaco vetorial e tem
//      resposta oposta; limiar alto evita servir o oposto. TTL curto por cima.
//
// Sem pgvector (Postgres local), o lookup degrada para igualdade exata da pergunta (similaridade 1.0),
// preservando as travas 1 e 2; a trava 3 e vacuamente satisfeita.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import { podeCachear, validarConteudoConhecimento } from './validador'
import { vetorDisponivel } from './retriever'

/** Similaridade minima (cosseno) para servir do cache. Alta de proposito (RAG.md 6). */
export const LIMIAR_SIMILARIDADE = 0.97
/** TTL padrao do cache, em segundos (curto: o cardapio/regra muda e o cache precisa expirar). */
export const TTL_PADRAO_SEGUNDOS = 900

export interface GravarCacheEntrada {
  lojaId: string
  pergunta: string
  resposta: string
  perguntaEmbedding?: number[]
  embeddingModel?: string
  ttlSegundos?: number
}

function literalVetor(v: readonly number[]): string {
  return `[${v.join(',')}]`
}

/**
 * Grava uma entrada de cache se, e so se, pergunta e resposta forem ESTAVEIS (sem dado vivo). Devolve
 * false (e nao grava) quando o classificador barra. contem_dado_vivo e sempre false (invariante).
 */
export async function gravarCache(exec: Executor, e: GravarCacheEntrada): Promise<boolean> {
  if (!podeCachear(e.pergunta, e.resposta)) return false
  const ttl = e.ttlSegundos ?? TTL_PADRAO_SEGUNDOS
  const temVetor = await vetorDisponivel(exec)
  const vec = temVetor && e.perguntaEmbedding?.length ? literalVetor(e.perguntaEmbedding) : null

  if (vec) {
    await consultar(
      exec,
      sql`insert into public.cache_semantico
            (loja_id, pergunta, resposta, expira_em, contem_dado_vivo, embedding_model, embedding, acertos)
          values (${e.lojaId}, ${e.pergunta}, ${e.resposta},
                  now() + make_interval(secs => ${ttl}), false, ${e.embeddingModel ?? null},
                  ${vec}::vector, 0)`,
    )
  } else {
    // Sem pgvector: insere sem referenciar a coluna embedding (ela nem existe no banco local).
    await consultar(
      exec,
      sql`insert into public.cache_semantico
            (loja_id, pergunta, resposta, expira_em, contem_dado_vivo, embedding_model, acertos)
          values (${e.lojaId}, ${e.pergunta}, ${e.resposta},
                  now() + make_interval(secs => ${ttl}), false, ${e.embeddingModel ?? null}, 0)`,
    )
  }
  return true
}

export interface ConsultarCacheEntrada {
  lojaId: string
  pergunta: string
  perguntaEmbedding?: number[]
}

/**
 * Busca uma resposta cacheada ESTAVEL para a loja. Retorna null se a pergunta cheira a dado vivo
 * (nao serve do cache nesse caso), se nada bate acima do limiar, ou se expirou. Em hit, incrementa
 * `acertos`. Escopo SEMPRE por loja (SEC-062).
 */
export async function consultarCache(exec: Executor, e: ConsultarCacheEntrada): Promise<string | null> {
  // Trava 2 no caminho de leitura: pergunta de dado vivo nunca e respondida pelo cache.
  if (!validarConteudoConhecimento(e.pergunta).ok) return null
  const temVetor = await vetorDisponivel(exec)

  let linha: { id: string; resposta: string } | null
  if (temVetor && e.perguntaEmbedding?.length) {
    const vec = literalVetor(e.perguntaEmbedding)
    linha = await consultarUm<{ id: string; resposta: string }>(
      exec,
      sql`select id, resposta
            from public.cache_semantico
           where loja_id = ${e.lojaId} and expira_em > now() and contem_dado_vivo = false
             and embedding is not null and (1 - (embedding <=> ${vec}::vector)) >= ${LIMIAR_SIMILARIDADE}
           order by embedding <=> ${vec}::vector
           limit 1`,
    )
  } else {
    // Degradado (sem vetor): igualdade exata da pergunta, ainda escopada por loja + nao-expirado.
    linha = await consultarUm<{ id: string; resposta: string }>(
      exec,
      sql`select id, resposta
            from public.cache_semantico
           where loja_id = ${e.lojaId} and expira_em > now() and contem_dado_vivo = false
             and pergunta = ${e.pergunta}
           order by criado_em desc
           limit 1`,
    )
  }

  if (!linha) return null
  await consultar(exec, sql`update public.cache_semantico set acertos = acertos + 1 where id = ${linha.id}`)
  return linha.resposta
}
