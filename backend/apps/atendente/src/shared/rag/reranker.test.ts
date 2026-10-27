// Reranker nulo (identidade): mantem a ordem do retrieval ate a avaliacao pedir um real (RAG.md 6).
import { describe, expect, it } from 'vitest'
import { criarRerankerNulo } from './reranker'
import type { TrechoRecuperado } from './tipos'

const t = (id: string, p: number): TrechoRecuperado => ({ chunkId: id, documentoId: id, texto: id, origem: 'manual', pontuacao: p })

describe('criarRerankerNulo', () => {
  it('devolve os trechos na mesma ordem', async () => {
    const trechos = [t('a', 3), t('b', 2), t('c', 1)]
    const r = await criarRerankerNulo().rerank('consulta', trechos)
    expect(r.map((x) => x.chunkId)).toEqual(['a', 'b', 'c'])
  })
})
