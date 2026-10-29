// ClienteEmbeddings: embeddings para RAG com a credencial da PLATAFORMA, nunca a chave da loja.
//
// Decisao do RAG.md secao 4 (a mais contraintuitiva do desenho): a dimensao do vetor e propriedade do
// INDICE; se cada loja escolhesse o proprio modelo, o indice teria vetores de espacos diferentes e a
// busca seria incoerente. Por isso embedding/rerank sao fixados na plataforma (credencial `OPEN_ROUTER`
// no processo do atendente), e so a GERACAO e a contextualizacao de chunk usam a chave BYO da loja.
//
// A chave da plataforma e lida de `process.env.OPEN_ROUTER`, pontualmente e com validacao Zod local
// (mesmo molde do `LLM_MASTER_KEY` em llm_client/cifra.ts; promocao para envAtendenteSchema fica como
// proposta). A chave vai SO no header de auth do adaptador (SEC-026), nunca no corpo nem em log.
import { z } from 'zod'
import {
  CredencialResolvida,
  falha,
  Permanente,
  type ErroProvedor,
  type RespostaEmbutir,
  type Resultado,
} from '@whaviso/shared/clientes'
import type { Executor } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import type { AdaptadorProvedor } from '../llm_client'
import type { Escopo } from '../escopo'
import { registrarUsoRag } from './uso'

/** Dimensao fixa do indice (espelha a coluna `vector(1536)` da migration 0018/0011). */
export const DIM_EMBEDDING = 1536
/** Modelo de embedding padrao da plataforma (gravado por chunk em `embedding_model`). */
export const MODELO_EMBEDDING_PADRAO = 'openai/text-embedding-3-small'

export interface EmbutirRagEntrada {
  exec: Executor
  escopo: Escopo
  textos: string[]
}

/** Porta de embeddings do RAG. A implementacao usa a credencial da PLATAFORMA e grava `uso_llm`. */
export interface ClienteEmbeddings {
  readonly modelo: string
  readonly dimensao: number
  embutir(e: EmbutirRagEntrada): Promise<Resultado<RespostaEmbutir, ErroProvedor>>
}

const envSchema = z.object({ OPEN_ROUTER: z.string().min(8, 'chave da plataforma ausente') })

/** Le a chave da plataforma de `process.env.OPEN_ROUTER` (lazy). Lanca se ausente (falha fechada). */
export function chavePlataformaPadrao(): string {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) throw new Error('OPEN_ROUTER ausente ou invalida')
  return parsed.data.OPEN_ROUTER
}

export interface OpcoesClienteEmbeddings {
  adaptador: AdaptadorProvedor
  logger: Logger
  /** Obtem a chave da plataforma (lazy); producao usa `chavePlataformaPadrao`, teste injeta a sua. */
  obterChave?: () => string
  modelo?: string
  dimensao?: number
}

/**
 * Cliente de embeddings da plataforma. Embute via o adaptador (ex.: OpenRouter) com a credencial da
 * plataforma e contabiliza `uso_llm` (tipo_uso='embedding', origem='plataforma'). A falha ao gravar o
 * uso nunca derruba a chamada nem vaza segredo (igual ao llm_client).
 */
export function criarClienteEmbeddingsPlataforma(op: OpcoesClienteEmbeddings): ClienteEmbeddings {
  const modelo = op.modelo ?? MODELO_EMBEDDING_PADRAO
  const dimensao = op.dimensao ?? DIM_EMBEDDING
  const obterChave = op.obterChave ?? chavePlataformaPadrao

  return {
    modelo,
    dimensao,
    async embutir(e) {
      let chave: string
      try {
        chave = obterChave()
      } catch {
        // Mensagem sem valor: so a categoria (a chave nunca entra em log).
        op.logger.error({ escopo_tipo: e.escopo.tipo, escopo_id: e.escopo.id }, 'credencial de embedding da plataforma ausente')
        return falha(new Permanente('credencial de embedding indisponivel', { codigo: 'rota' }))
      }
      const credencial = new CredencialResolvida(chave)
      const r = await op.adaptador.embutir({ credencial, textos: e.textos, modelo })
      if (r.ok) {
        try {
          await registrarUsoRag(e.exec, {
            escopo: e.escopo,
            provedor: op.adaptador.provedor,
            modelo,
            tipoUso: 'embedding',
            uso: r.valor.uso,
          })
        } catch (erro) {
          op.logger.error({ escopo_tipo: e.escopo.tipo, escopo_id: e.escopo.id, err: erro }, 'falha ao registrar uso_llm de embedding')
        }
      }
      return r
    },
  }
}
