// Chunking por UNIDADE LOGICA (RAG.md secao 2): cada descricao de item, cada regra, cada par de FAQ
// e um chunk (1 a 4 frases). O corpus e curto e ja vem semiestruturado, entao janela fixa com overlap
// so atrapalharia (rejeitada no RAG.md). Puro e deterministico, para ser testavel sem banco.
import type { ChunkBruto, DocumentoParaIngestao } from './tipos'

/** Maximo de frases por chunk quando um paragrafo e longo demais (regra/politica em prosa). */
const MAX_FRASES = 4

/** Quebra um bloco em frases (fim por .!? seguido de espaco). Mantem a pontuacao. */
function emFrases(bloco: string): string[] {
  return bloco
    .split(/(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0)
}

/** Agrupa frases em janelas de ate MAX_FRASES, preservando a ordem. */
function agruparFrases(frases: string[]): string[] {
  const grupos: string[] = []
  for (let i = 0; i < frases.length; i += MAX_FRASES) {
    grupos.push(frases.slice(i, i + MAX_FRASES).join(' '))
  }
  return grupos
}

/**
 * Parte o documento em chunks logicos. Blocos separados por linha em branco sao unidades (um item,
 * uma regra, um par P/R de FAQ); um bloco muito longo em prosa quebra em janelas de ate 4 frases.
 */
export function chunkPorUnidadeLogica(doc: Pick<DocumentoParaIngestao, 'tipo' | 'conteudo'>): ChunkBruto[] {
  const blocos = doc.conteudo
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s+/g, ' ').trim())
    .filter((b) => b.length > 0)

  const textos: string[] = []
  for (const bloco of blocos) {
    const frases = emFrases(bloco)
    // FAQ e blocos curtos ficam inteiros (um par P/R = um chunk); prosa longa quebra por frases.
    if (doc.tipo === 'faq' || frases.length <= MAX_FRASES) textos.push(bloco)
    else textos.push(...agruparFrases(frases))
  }
  return textos.map((texto, ordem) => ({ ordem, texto }))
}
