// ClienteReranker: reordena os trechos recuperados por relevancia a consulta. Decisao do RAG.md
// secao 6: reranker NAO entra no dia um (corpus por loja e minusculo; hibrido + RRF ja poe o trecho
// certo no topo). Entra atras desta interface quando a avaliacao (RAG-EVAL-001) mostrar top-k errando,
// e ai como API gerida (Cohere Rerank multilingue), sem tocar em quem consome.
//
// A implementacao PADRAO e nula (identidade): nao reordena e custa zero. Trocar por Cohere e mudanca
// pontual (nova implementacao desta porta), nunca espalhada.
import type { TrechoRecuperado } from './tipos'

export interface ClienteReranker {
  /** Reordena os trechos para a consulta. A nula devolve a mesma ordem. */
  rerank(consulta: string, trechos: TrechoRecuperado[]): Promise<TrechoRecuperado[]>
}

/** Reranker nulo (identidade): mantem a ordem do retrieval. Custo zero ate a avaliacao pedir. */
export function criarRerankerNulo(): ClienteReranker {
  return {
    async rerank(_consulta, trechos) {
      return trechos
    },
  }
}
