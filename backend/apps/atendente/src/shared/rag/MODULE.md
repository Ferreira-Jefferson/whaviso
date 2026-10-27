# shared/rag (AT-rag)

Kernel de conhecimento do atendente: **retrieval hibrido escopado por loja** + ingestao de documento
aprovado + cache semantico travado + avaliacao. Fonte do desenho: [docs/pivot/RAG.md](../../../../../docs/pivot/RAG.md).
Especialista do app (nao e `modules/`): consumido por `entender_mensagem`/motor e, depois, por uma
ToolContract de AT-tools. Importe so pela API publica (`index.ts`).

## A regra de ouro

So entra no indice o que e **estavel e textual** (descricoes, regras, FAQ). Dado ao-vivo (preco,
disponibilidade, status, taxa) **nunca** vira embedding nem cache: vem de consulta estruturada
(tool-use). O validador de ingestao barra isso por construcao (`validador.ts`).

## Pecas (RAG.md secao 2)

- `retriever.ts` **`buscarConhecimento`**: unica porta de leitura. Uma query SQL hibrida (cosseno
  pgvector + BM25 `ts_rank` portuguese, fundidos por RRF), **pre-filtro `where loja_id` em cada
  sub-select e no join final** (RAG-ISO-001). Sem pgvector, degrada para BM25 sozinho; o isolamento
  nao muda. Reranker nulo por padrao.
- `ingestor.ts` **`ingerirDocumento`**: so `status='aprovado'`; valida -> chunk -> contextualiza
  (opcional) -> embeddia (plataforma) -> grava chunks com `loja_id` desnormalizado. Reindexa
  (delete+insert), idempotente por documento.
- `embeddings.ts` **`ClienteEmbeddings`**: embedding pela credencial da **plataforma** (`OPEN_ROUTER`),
  dimensao fixa (1536); grava `uso_llm` com `tipo_uso='embedding'`, `origem='plataforma'`. Geracao e
  contextualizacao seguem BYO pelo `ServicoLlm` (chave da loja).
- `reranker.ts` **`ClienteReranker`**: interface + implementacao **nula** (identidade). Cohere fica
  atras dela quando a avaliacao pedir.
- `cache.ts`: cache semantico so para resposta estavel (classificador), namespace por loja, limiar
  alto (0.97), TTL curto, invariante `contem_dado_vivo=false`.
- `montar_contexto.ts`: trechos entram **delimitados como DADO, nunca comando** (SEC-060/061), com teto
  de tamanho e a nota de que o dado estruturado manda sobre numero na prosa.
- `avaliacao.ts`: `hit@k`/context recall deterministicos (RAG-EVAL-001, gate); faithfulness
  (RAG-EVAL-002) e esqueleto, amostrado fora do gate.
- `chunking.ts` / `validador.ts`: puros, por unidade logica e barra de dado vivo.

## Tabelas (migration 0018)

- **Le:** `documentos` (so `status='aprovado'`), `chunks`, `cache_semantico`, `base_avaliacao`.
- **Escreve (whaviso_atendente):** `chunks` (ingestao/reindex), `cache_semantico`, `uso_llm`
  (`tipo_uso`), `documentos` (rascunho via realimentacao), `rag_feedback` (sinal).

## Regras

- `loja_id` vem SEMPRE da conversa resolvida no servidor; nunca de texto do cliente ou saida do modelo.
- Dinheiro em centavos; dados so via `@whaviso/shared/db` (SEC-080). Nunca logar PII nem a chave.
- Uma passada de retrieval (sem multi-hop); reranker/Cohere, HyDE e GraphRAG fora desta onda.
