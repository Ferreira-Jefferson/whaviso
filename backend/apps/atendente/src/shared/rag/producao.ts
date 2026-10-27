// Fiacao de PRODUCAO do RAG. O cliente de embeddings usa o adaptador OpenRouter com a credencial da
// PLATAFORMA (`OPEN_ROUTER` no processo do atendente), nao a chave da loja (RAG.md 4). Trocar o
// provedor de embedding e mudanca pontual aqui, sem tocar no retriever/ingestor.
import type { Logger } from '@whaviso/shared/logger'
import { criarAdaptadorOpenRouter } from '../llm_client'
import {
  criarClienteEmbeddingsPlataforma,
  type ClienteEmbeddings,
  type OpcoesClienteEmbeddings,
} from './embeddings'

export interface OpcoesEmbeddingsProducao {
  logger: Logger
  modelo?: string
  dimensao?: number
  obterChave?: OpcoesClienteEmbeddings['obterChave']
}

/** Cliente de embeddings pronto para producao (OpenRouter + credencial da plataforma `OPEN_ROUTER`). */
export function criarClienteEmbeddingsProducao(op: OpcoesEmbeddingsProducao): ClienteEmbeddings {
  return criarClienteEmbeddingsPlataforma({
    adaptador: criarAdaptadorOpenRouter({}),
    logger: op.logger,
    ...(op.obterChave ? { obterChave: op.obterChave } : {}),
    ...(op.modelo ? { modelo: op.modelo } : {}),
    ...(op.dimensao ? { dimensao: op.dimensao } : {}),
  })
}
