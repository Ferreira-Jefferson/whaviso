// Integracao do RAG (AT-rag) no Postgres LOCAL, sob o role whaviso_atendente (menor privilegio real,
// SEC-032). Semeia documentos aprovados por loja, ingere (chunk + persist), recupera (hibrido; no
// Postgres local sem pgvector, degrada para BM25 com pre-filtro por loja) e exercita cache + avaliacao.
// Sem banco acessivel, os testes se pulam.
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { ok } from '@whaviso/shared/clientes'
import { criarLogger } from '@whaviso/shared/logger'
import {
  avaliarHitAtK,
  buscarConhecimento,
  consultarCache,
  criarClienteEmbeddingsPlataforma,
  DIM_EMBEDDING,
  criarRerankerNulo,
  gravarCache,
  ingerirDocumento,
  _resetVetorCache,
  type ClienteEmbeddings,
  type DepsRetriever,
} from '../src/shared/rag'
import type { AdaptadorProvedor } from '../src/shared/llm_client'
import { bancoAcessivel, fecharPools, limpar, poolAtendente, poolSuper, semear } from './db'

const online = await bancoAcessivel()
const logger = criarLogger('rag-it', 'silent')

/** Adaptador falso de embedding: sem rede, vetor fixo + uso conhecido (para o livro-razao). */
function fakeAdaptador(): AdaptadorProvedor {
  const falha = (): never => {
    throw new Error('nao usado')
  }
  return {
    provedor: 'openrouter',
    completar: falha as never,
    transcrever: falha as never,
    descreverImagem: falha as never,
    async embutir(e) {
      return ok({
        // Vetor com a dimensao do indice (coluna vector(1536)); constante, entao o componente
        // vetorial e neutro e o ranqueamento vem do BM25 (igual ao run local sem pgvector).
        vetores: e.textos.map(() => new Array(DIM_EMBEDDING).fill(0.1) as number[]),
        uso: { tokensIn: 3, tokensOut: 0, custoEstimadoCentavos: 0 },
      })
    },
  } as AdaptadorProvedor
}

function embeddings(): ClienteEmbeddings {
  return criarClienteEmbeddingsPlataforma({ adaptador: fakeAdaptador(), logger, obterChave: () => 'chave-de-teste-plataforma' })
}

function deps(): DepsRetriever {
  return { exec: poolAtendente, embeddings: embeddings(), reranker: criarRerankerNulo() }
}

/** Insere um documento aprovado via superusuario e devolve o id. */
async function inserirDocumento(lojaId: string, tipo: string, titulo: string, conteudo: string, status = 'aprovado'): Promise<string> {
  const r = await poolSuper.query(
    `insert into public.documentos (loja_id, tipo, titulo, conteudo, status)
     values ($1,$2::documento_tipo,$3,$4,$5::documento_status) returning id`,
    [lojaId, tipo, titulo, conteudo, status],
  )
  return r.rows[0].id as string
}

const contas: string[] = []
afterEach(async () => {
  while (contas.length) await limpar(contas.pop()!)
})
afterAll(fecharPools)

describe.skipIf(!online)('AT-rag ingestao + retrieval (role whaviso_atendente)', () => {
  it('ingere um documento aprovado em chunks e recupera o trecho certo da loja', async () => {
    _resetVetorCache()
    const a = await semear()
    contas.push(a.contaId)
    const doc = await inserirDocumento(a.lojaId, 'descricao', 'X-Tudo', 'O X-Tudo leva ovo e bacon, nao tem como tirar o ovo.')

    const r = await ingerirDocumento({ exec: poolAtendente, embeddings: embeddings(), logger }, doc)
    expect(r.chunks).toBeGreaterThan(0)
    expect(r.pulado).toBeUndefined()

    const trechos = await buscarConhecimento(deps(), { lojaId: a.lojaId, consulta: 'o x-tudo tem bacon?' })
    expect(trechos.length).toBeGreaterThan(0)
    expect(trechos[0]!.documentoId).toBe(doc)
    expect(trechos[0]!.texto.toLowerCase()).toContain('bacon')
  })

  it('ingestao barra documento que cheira a dado vivo (nao cria chunk)', async () => {
    _resetVetorCache()
    const a = await semear()
    contas.push(a.contaId)
    const doc = await inserirDocumento(a.lojaId, 'descricao', 'Preco', 'O X-Tudo custa R$ 32 hoje.')
    const r = await ingerirDocumento({ exec: poolAtendente, embeddings: embeddings(), logger }, doc)
    expect(r.pulado).toBe('dado_vivo')
    expect(r.chunks).toBe(0)
    const { rows } = await poolSuper.query('select count(*)::int as n from public.chunks where documento_id = $1', [doc])
    expect(rows[0].n).toBe(0)
  })

  it('so indexa documento aprovado (rascunho e pulado)', async () => {
    _resetVetorCache()
    const a = await semear()
    contas.push(a.contaId)
    const doc = await inserirDocumento(a.lojaId, 'regra', 'Rascunho', 'Nao fazemos meia a meia.', 'rascunho')
    const r = await ingerirDocumento({ exec: poolAtendente, embeddings: embeddings(), logger }, doc)
    expect(r.pulado).toBe('nao_aprovado')
  })

  it('reingestao do mesmo documento e idempotente (reindexa, nao duplica)', async () => {
    _resetVetorCache()
    const a = await semear()
    contas.push(a.contaId)
    const doc = await inserirDocumento(a.lojaId, 'regra', 'Regras', 'Nao fazemos meia a meia.\n\nTempo medio de quarenta minutos.')
    await ingerirDocumento({ exec: poolAtendente, embeddings: embeddings(), logger }, doc)
    await ingerirDocumento({ exec: poolAtendente, embeddings: embeddings(), logger }, doc)
    const { rows } = await poolSuper.query('select count(*)::int as n from public.chunks where documento_id = $1', [doc])
    expect(rows[0].n).toBe(2) // os 2 blocos, sem duplicar apos reingestao
  })

  it('hit@k (RAG-EVAL-001) sobre o golden set semente passa o piso', async () => {
    _resetVetorCache()
    const a = await semear()
    contas.push(a.contaId)
    const entrega = await inserirDocumento(a.lojaId, 'politica', 'Entrega', 'Fazemos entrega em toda a regiao central da cidade.')
    const pagamento = await inserirDocumento(a.lojaId, 'regra', 'Pagamento', 'As formas de pagamento aceitas sao cartao e dinheiro.')
    for (const d of [entrega, pagamento]) await ingerirDocumento({ exec: poolAtendente, embeddings: embeddings(), logger }, d)

    await poolSuper.query(
      `insert into public.base_avaliacao (loja_id, pergunta, docs_esperados, origem)
       values ($1,$2,$3,'semente'),($1,$4,$5,'semente')`,
      [a.lojaId, 'voces fazem entrega?', [entrega], 'quais formas de pagamento?', [pagamento]],
    )

    const res = await avaliarHitAtK(deps(), a.lojaId, 4)
    expect(res.casos).toBe(2)
    expect(res.hitAtK).toBe(1)
    expect(res.contextRecall).toBeGreaterThan(0)
  })

  it('cache semantico: grava Q/A estavel e serve na loja; recusa resposta com dado vivo', async () => {
    _resetVetorCache()
    const a = await semear()
    contas.push(a.contaId)
    expect(await gravarCache(poolAtendente, { lojaId: a.lojaId, pergunta: 'voces fazem entrega?', resposta: 'Sim, em toda a regiao central.' })).toBe(true)
    expect(await consultarCache(poolAtendente, { lojaId: a.lojaId, pergunta: 'voces fazem entrega?' })).toContain('regiao central')

    // resposta com preco nunca e cacheada
    expect(await gravarCache(poolAtendente, { lojaId: a.lojaId, pergunta: 'quanto custa?', resposta: 'Custa R$ 40' })).toBe(false)
  })

  it('cache expirado nao e servido', async () => {
    _resetVetorCache()
    const a = await semear()
    contas.push(a.contaId)
    await poolAtendente.query(
      `insert into public.cache_semantico (loja_id, pergunta, resposta, expira_em, contem_dado_vivo)
       values ($1,'tem wifi?','Sim, senha na parede.', now() - interval '1 minute', false)`,
      [a.lojaId],
    )
    expect(await consultarCache(poolAtendente, { lojaId: a.lojaId, pergunta: 'tem wifi?' })).toBeNull()
  })

  it('embedding da plataforma grava uso_llm com tipo_uso=embedding e origem=plataforma', async () => {
    _resetVetorCache()
    const a = await semear()
    contas.push(a.contaId)
    const r = await embeddings().embutir({ exec: poolAtendente, lojaId: a.lojaId, textos: ['oi', 'tchau'] })
    expect(r.ok).toBe(true)
    const { rows } = await poolSuper.query(
      `select tipo_uso, origem, tokens_entrada from public.uso_llm where loja_id = $1`,
      [a.lojaId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].tipo_uso).toBe('embedding')
    expect(rows[0].origem).toBe('plataforma')
  })
})
