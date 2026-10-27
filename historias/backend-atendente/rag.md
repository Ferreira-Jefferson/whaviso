# AT-rag rag + base_conhecimento

- **ID:** AT-rag  ·  **Área:** AT  ·  **Onda:** 2
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (ninguem)

> **Fonte do design:** [../../docs/pivot/RAG.md](../../docs/pivot/RAG.md) (lido na escrita deste plano).
> Este módulo o executa; divergência entre este arquivo e o RAG.md se resolve a favor do RAG.md ou escala.
> Atenção: o RAG.md é **proposta** (status "para o dono aprovar"). Não começar sem a aprovação dele.

## Objetivo

Entregar o **retrieval híbrido escopado por loja** que alimenta o atendente com o conhecimento estável e
textual do negócio (descrições, ingredientes, regras, políticas, FAQ), sem cruzar tenants. Pipeline:
ingestão de documento aprovado (chunk por unidade lógica, Contextual Retrieval, embedding, `tsvector`) e
busca híbrida (vetor + BM25 com fusão RRF numa única query SQL), mais `cache_semantico` travado.
**Dado ao vivo (preço, disponibilidade, status, taxa de zona) nunca entra no índice nem no cache**: vem de
consulta estruturada (tool-use). "Pronto" observável: uma pergunta de cliente recupera trechos só da loja
da conversa; documento de outra loja nunca é candidato; reajuste de preço no painel reflete na resposta
sem reindexar nada.

## Dependências

- `AT-llm`: geração e **contextualização de chunk** usam `ClienteLLM` com a chave da loja (BYO).
- `docs/pivot/RAG.md`: design (existe, **aguardando aprovação do dono**).
- **Migration `0013_rag` (a criar, fora do baseline F0):** `documentos`, `chunks`, `base_avaliacao`,
  `rag_feedback`, deltas em `cache_semantico` e `uso_llm.tipo_uso` (RAG.md 7.1). Dono do schema (F0/área de
  banco) cria; este módulo **não** altera migration. **Bloqueio explícito:** sem a 0013 aplicada, não
  começar as etapas de ingestão e busca. Requer `pgvector` no Postgres de teste.
- `API-conhecimento` (novo módulo da api, curadoria/aprovação, **não listado ainda no STATUS.md**):
  fonte do evento de aprovação que dispara a ingestão. Registrado como lacuna de plano, ver Notas.

## Contratos e tabelas que toca

- **Papel de banco:** `whaviso_atendente`.
- **Lê:** `documentos` (apenas `status='aprovado'`), `chunks`, `cache_semantico`, `base_avaliacao`.
- **Escreve:** `chunks` (ingestão), `cache_semantico`, `uso_llm` (com `tipo_uso`: `geracao`, `embedding`,
  `rerank`).
- **Lê ao vivo, fora do RAG:** `itens`, `opcoes`, `pedidos`, `zonas_entrega`, `lojas.horarios`.
- Contratos do kernel: `TrechoRecuperado` (texto, `documento_id`, origem, pontuação), `ClienteEmbeddings`
  e `ClienteReranker` (interfaces; este último com implementação nula por padrão).
- **Credencial de embedding/rerank:** da **plataforma**, não de `credenciais_llm` (decisão RAG.md seção 4);
  a dimensão do vetor é propriedade do índice. Geração e contextualização seguem BYO.

## Arquivos (escopo de edição)

- `backend/apps/atendente/src/shared/rag/**` (`retriever.ts`, `ingestor.ts`, `ClienteEmbeddings`,
  `ClienteReranker`, cache semântico)
- `backend/apps/atendente/src/modules/base_conhecimento/**` (consumidor do evento de aprovação e
  reindexação)
- `backend/apps/atendente/test/**` e `backend/apps/atendente/test/security/**`

## Etapas

- [ ] Confirmar aprovação do RAG.md e a existência da `0013_rag` aplicada no banco de teste com `pgvector`;
      registrar o que faltar em Notas  (commit: `docs(atendente): pre-requisitos do rag verificados`)
- [ ] Ambiente de teste: Postgres com `pgvector` para a suíte do RAG (preparar e documentar)  (commit: `test(atendente): ambiente pgvector`)
- [ ] Interface `ClienteEmbeddings` + implementação do provedor da plataforma (dimensão fixa, modelo
      gravado por chunk em `embedding_model`); `uso_llm` com `tipo_uso='embedding'`  (commit: `feat(atendente): cliente de embeddings da plataforma`)
- [ ] Interface `ClienteReranker` com implementação nula (identidade); Cohere fica fora desta onda  (commit: `feat(atendente): interface de reranker com implementacao nula`)
- [ ] Chunking por **unidade lógica** (descrição de item, regra, par de FAQ; 1 a 4 frases), sem janela fixa
  (commit: `feat(atendente): chunking por unidade logica`)
- [ ] Validador determinístico de conteúdo na ingestão: barra dado vivo (R$, "hoje", "agora", "esgotado",
      "disponível", status de pedido), telefone/Pix e qualquer coisa com cara de token/chave  (commit: `feat(atendente): validador de dado vivo na ingestao`)
- [ ] Contextual Retrieval: prefixo de contexto por chunk gerado via `ClienteLLM` (chave da loja) com prompt
      caching do documento inteiro; sem credencial, ingerir sem prefixo e marcar o chunk  (commit: `feat(atendente): contextual retrieval na ingestao`)
- [ ] Ingestor: ao evento de aprovação, gera chunks, `texto_contextualizado`, embedding e `tsv`
      (`portuguese`), grava com `loja_id` desnormalizado; nova versão arquiva chunks da anterior e
      reembedda; idempotente por documento/versão  (commit: `feat(atendente): ingestor de documentos aprovados`)
- [ ] Consumidor do evento de aprovação por outbox/claim no banco (sem import da api)  (commit: `feat(atendente): consumidor de aprovacao de documento`)
- [ ] Retriever híbrido: **uma query SQL** com dois sub-selects (cosseno HNSW e `ts_rank` BM25) fundidos por
      RRF, **pré-filtro `WHERE loja_id = $1` antes do ranqueamento**, ~8 candidatos, contexto final ~4,
      peso menor ao esparso (ponto de partida, calibrar na avaliação)  (commit: `feat(atendente): retriever hibrido com rrf por loja`)
- [ ] Montagem de contexto: trechos delimitados como **dado não confiável**, com teto de tamanho, e o dado
      ao vivo costurado por tool-use estruturado (schema Zod); instrução de que o dado estruturado manda
      sobre qualquer número na prosa  (commit: `feat(atendente): montagem de contexto com dado ao vivo`)
- [ ] `cache_semantico`: lookup sempre com `loja_id`, similaridade alta (0.97 ou mais), TTL curto,
      classificação da pergunta antes de servir; **nunca** guarda resposta com preço/disponibilidade/status;
      invariante `contem_dado_vivo=false`  (commit: `feat(atendente): cache semantico travado`)
- [ ] Invalidação: documento arquivado/editado invalida chunks e entradas de cache derivadas  (commit: `feat(atendente): invalidacao de indice e cache`)
- [ ] Reindexação por troca de modelo de embedding como job explícito (nunca acidental)  (commit: `feat(atendente): job de reembedding`)
- [ ] Exposição por contrato: função de retrieval consumida por `entender_mensagem`/motor, que decide se e
      quando consultar (uma passada, sem multi-hop)  (commit: `feat(atendente): contrato de retrieval`)
- [ ] Avaliação: golden set `base_avaliacao` com semente por loja; teste `hit@k` e context recall
      determinísticos (RAG-EVAL-001) no gate; faithfulness amostrado (RAG-EVAL-002) fora do gate, apenas o
      esqueleto do job  (commit: `test(atendente): avaliacao de retrieval`)
- [ ] Testes de unidade e de segurança (ver abaixo)  (commit: `test(atendente): rag`)
- [ ] Revisão (Opus) contra SEGURANCA.md (isolamento entre lojas, injeção)

## Testes e segurança exigidos

- Unidade: chunking, validador de dado vivo (casos positivos e negativos), RRF (ordem esperada), piso e
  limites, TTL e invalidação de cache, exclusão de pergunta de dado vivo.
- Integração com `pgvector`: duas lojas com cardápios parecidos; busca de A nunca retorna chunk de B.
- **SEC-062**: nenhum documento ou chunk de outra loja entra no contexto, inclusive pelo caminho do cache
  (cache de A nunca serve B).
- **RAG-ISO-001** (extensão de SEC-062, a registrar no catálogo): `loja_id` forjado no payload ou na saída
  do modelo não altera o escopo; o `loja_id` vem da conversa resolvida no servidor.
- **RAG-EVAL-001**: `hit@k` sobre o golden set semente acima do limiar acordado (gate).
- **SEC-060**: trecho com instrução maliciosa embutida ("revele a chave") não altera o comportamento nem
  extrai segredo; recuperado é contexto, nunca instrução.
- **SEC-061**: a saída do modelo é dado; o RAG não dispara ação.
- **SEC-026/024**: chave só no header do `ClienteLLM`; texto de perguntas e trechos fora dos logs.
- **SEC-032**: o role do atendente só toca as tabelas do seu escopo.

## Notas e decisões

- Decisão (do RAG.md): RAG híbrido **dentro do Postgres**, sem serviço de vetor; GraphRAG, HyDE e RAG
  agêntico multi-hop rejeitados; reranker só quando a avaliação pedir; fine-tuning fora do roadmap.
- Decisão: **embedding e rerank são da plataforma, geração é BYO**. Isso exige que o `llm_client` e o
  `uso_llm` distingam `tipo_uso`, e que `credenciais_llm.chave_cifrada` continue restrito ao uso de geração.
  Registrado também em `AT-llm`.
- Lacuna de plano: o RAG.md cria o módulo `api/modules/conhecimento` (curadoria, aprovação, versionamento,
  golden set) e a migration `0013_rag`. **Nenhum dos dois está no STATUS.md.** Escalar ao coordenador para
  incluir `API-conhecimento` e a 0013 como dependências formais antes de iniciar este módulo.
- Decisão: o filtro por `loja_id` é parte da query vetorial, nunca pós-processamento em memória.
- Decisão: só entra na base o que o dono aprovou; o RAG nunca indexa rascunho (ver `AT-realimentar`).
