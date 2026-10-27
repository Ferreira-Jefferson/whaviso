# Camada de conhecimento do whaviso: RAG e técnicas correlatas (proposta)

> **Status:** proposta, para o dono revisar e aprovar antes de encodar no CLAUDE.md/AGENTS.md.
> **Data:** 2026-10-27. Produto: automação de pedidos de restaurante por WhatsApp, multi-tenant.
> **Relacionado:** [ARQUITETURA.md](ARQUITETURA.md) (runtime `atendente`, `ClienteLLM`, outbox),
> [BANCO.md](BANCO.md) (`base_conhecimento`, `cache_semantico`, `credenciais_llm`, RLS por loja),
> [SEGURANCA.md](SEGURANCA.md) (isolamento de loja, chave de LLM, prompt injection, catálogo de testes).
> **Base:** pesquisa web sobre o estado da prática de RAG em 2025-2026 (fontes ao final). Ressalva
> honesta: a maioria das fontes é blog de fornecedor ou consultoria, não benchmark controlado; onde
> cito número, é indicativo, não garantia.

## Veredito curto

A camada de conhecimento do `atendente` deve ser **RAG híbrido dentro do Postgres**, sem serviço de
vetor dedicado, com três decisões que mais pagam, em ordem:

1. **A linha entre conhecimento e dado ao-vivo é o projeto inteiro.** Preço, disponibilidade,
   status do pedido e taxa de zona **nunca** viram embedding; vêm de consulta estruturada às tabelas
   (tool-use). O RAG guarda só o que é **estável e textual**: descrições, regras da loja, políticas,
   FAQ. Embeddar dado vivo é a pior falha possível aqui (responder preço defasado com confiança).
2. **Retrieval híbrido (vetor + BM25) com fusão RRF numa única query SQL**, usando `pgvector` +
   `tsvector` (dicionário `portuguese`). Corpus por loja é pequeno; isso basta e dispensa infra nova.
3. **Contextual Retrieval na ingestão** (prefixo de contexto gerado por LLM antes de embeddar/indexar),
   barateado por prompt caching. É o maior ganho de recall por real gasto para corpora curtos e cheios
   de nomes próprios (nomes de prato), que é exatamente o nosso caso.

O reranker **não** entra no dia um (corpus minúsculo por loja); entra atrás de interface quando a
avaliação provar que falta. GraphRAG e RAG agêntico multi-hop ficam **rejeitados** para este produto
(latência no WhatsApp e custo não se justificam num cardápio de um restaurante).

---

## 1. O que o RAG precisa resolver aqui

O `atendente` responde o cliente final no WhatsApp com base em três fontes, e **cada uma tem um dono
de verdade diferente**:

| Fonte | Natureza | Como o modelo acessa | Mora em |
|---|---|---|---|
| Estrutura do cardápio (itens, preços, grupos de opções, esgotado) | **ao-vivo, estruturado** | consulta SQL / tool-use | tabelas `itens`, `opcoes`, `grupos_opcoes` |
| Status do pedido, taxa da zona, horário aberto/fechado agora | **ao-vivo, estruturado** | consulta SQL / tool-use | `pedidos`, `zonas_entrega`, `lojas.horarios` |
| Descrições, recomendações, ingredientes, alergênicos | **estável, textual** | **RAG** | `base_conhecimento` |
| Regras da loja (não faz meia a meia, tempo médio, formas de pagamento, política de entrega, troco) | **estável, textual** | **RAG** | `base_conhecimento` |
| FAQ recorrente ("tem estacionamento?", "é picante?") | **estável, textual** | **RAG** | `base_conhecimento` |

**A regra de ouro (e a fonte número um de bug):** o que muda sozinho ou é consultável com uma chave
primária **não entra no índice de embeddings**. O preço do X-Tudo é uma coluna, não um documento. Se
o preço virar texto embeddado, um reajuste no painel deixa o índice mentindo até alguém reembeddar, e
o modelo vai afirmar o preço velho com toda a confiança. O mesmo vale para "esgotado hoje",
disponibilidade por horário e status do pedido.

O desenho que resolve isso é **retrieval híbrido + tool-use estruturado no mesmo turno**: o RAG traz
a prosa ("o X-Tudo leva ovo e bacon, não tem como tirar o ovo"), a consulta estruturada traz o número
vivo (preço atual, se está esgotado). O prompt final costura os dois, e o modelo é instruído a tratar
o dado estruturado como autoridade sobre qualquer número que porventura apareça na prosa.

Consequência de projeto: o RAG do whaviso é **pequeno e curado**, não um data lake. Um restaurante
típico cabe em algumas dezenas a poucas centenas de trechos. Isso derruba a necessidade de metade das
técnicas pesadas de RAG de corpus grande, e é por isso que este documento é enxuto onde a indústria é
barroca.

---

## 2. Arquitetura modular do RAG

O pipeline canônico é **ingestão -> chunk -> embed -> index -> retrieve -> (rerank) -> montar contexto
-> gerar**. No whaviso ele se parte em dois tempos com donos diferentes, para respeitar "módulo não
importa módulo" e o fluxo de curadoria:

```
INGESTÃO (offline, disparada por aprovação do dono)
  documento aprovado -> chunk -> contextualizar (LLM) -> embed -> gravar chunks + tsvector + vetor

ATENDIMENTO (online, por mensagem do cliente)
  mensagem -> reescrever consulta -> retrieve híbrido (vetor + BM25, RRF)
           -> [rerank opcional] -> montar contexto (+ dado ao-vivo via tool) -> gerar resposta
```

### Onde cada peça vive (casando com a estrutura do ARQUITETURA.md)

- **`atendente/shared/rag/`** (kernel do atendente, consumido por módulos, sem regra de negócio):
  - `retriever.ts`: orquestra a busca híbrida (monta e roda a query SQL de RRF), recebe `loja_id` e
    devolve trechos já escopados. É a única porta de leitura da base de conhecimento.
  - `ingestor.ts`: chunk + contextualização + embedding de um documento aprovado.
  - `ClienteEmbeddings` (interface): `embed(textos[]) -> vetores[]`. Provedor plugável, **gerido pela
    plataforma** (ver seção 4, decisão da chave), dimensão fixa.
  - `ClienteReranker` (interface, implementação nula por padrão): `rerank(consulta, trechos[]) ->
    trechos ordenados`. A implementação default é identidade (não reordena); a real (Cohere) entra sem
    tocar quem a consome.
  - A **geração** continua no `ClienteLLM` já previsto em `atendente/shared/llm_client` (BYO key da
    loja). A contextualização de chunk na ingestão também usa `ClienteLLM`.
- **`atendente/modules/retroalimentar_base/`**: produz **rascunhos** de documento a partir das
  conversas (seção 3). Nunca embedda direto; só escreve `documentos` em estado `rascunho`.
- **`atendente/modules/entender_mensagem/`**: já faz STT + intenção; ganha a **reescrita de consulta**
  (transforma o turno do cliente, curto e ruidoso, numa consulta de retrieval autônoma usando as
  últimas mensagens). Reescrita barata, no mesmo passo, sem chamada extra dedicada.
- **`api/modules/conhecimento/`** (plano da loja, **novo**): CRUD dos documentos, fila de aprovação
  dos rascunhos, versionamento e a tela de curadoria do dono. A `api` **não embedda** (não tem provedor
  no caminho dela); ao aprovar, enfileira um evento no outbox e o `atendente` faz a ingestão. Isso
  mantém a fronteira: a `api` é dona da curadoria, o `atendente` é dono do vetor.

### Por que atrás de interface

`ClienteEmbeddings` e `ClienteReranker` seguem a mesma família de `ClienteWhats`/`ClienteMapas`/
`ClienteLLM`: trocar o modelo de embedding ou ligar um reranker é mudança **pontual**, não espalhada.
A dimensão do vetor é propriedade do **índice**, então ela fica gravada por chunk (`embedding_model`,
`dim`); trocar de modelo de embedding exige reembeddar e é um job explícito, não um acidente.

### Decisões concretas do pipeline

- **Chunking:** por **unidade lógica**, não por janela fixa de tokens. Cada descrição de item, cada
  regra, cada par de FAQ é um chunk (1 a 4 frases). O corpus é curto e já vem semiestruturado, então
  janela fixa com overlap só atrapalharia. Rejeitado: chunking por N tokens com overlap (resolve
  problema de documento longo, que não temos).
- **Contextual Retrieval (Anthropic):** antes de embeddar, um prompt barato ao `ClienteLLM` prefixa
  cada chunk com uma linha de contexto (nome da loja + categoria/seção + a que o trecho se refere).
  Reduz falha de retrieval de forma relevante quando há muitos nomes parecidos (vários lanches, várias
  pizzas), e o custo é amortizado por **prompt caching** do documento inteiro. É a técnica de melhor
  relação ganho/custo para o nosso perfil de dado.
- **Híbrido + RRF numa query:** dois sub-selects (distância cosseno no `pgvector` HNSW; `ts_rank` sobre
  `tsvector` em `portuguese`), fundidos por Reciprocal Rank Fusion. RRF opera sobre posição de rank,
  então dispensa normalizar score. Peso levemente menor ao BM25 (padrão da literatura ~0.25 sparse) é
  um ponto de partida a calibrar na avaliação.
- **Top-k enxuto:** recuperar ~8 candidatos, montar contexto com ~4. Corpus pequeno e janela do WhatsApp
  curta pedem contexto curto; menos trecho irrelevante também reduz superfície de prompt injection.

---

## 3. O loop de realimentação (o chat produz conhecimento)

O objetivo é que a base melhore sozinha com o uso, **sem** nunca deixar lixo ou dado vivo entrar. O
desenho é **produção automática, promoção manual**.

### Como o chat produz candidatos

O `retroalimentar_base` observa sinais de conversa e gera **rascunhos de documento**, nunca entradas
ativas:

1. **Lacuna de conhecimento:** o retrieval voltou fraco (score abaixo do limiar) ou o modelo respondeu
   "não sei / vou verificar" e a conversa caiu para humano. O par pergunta-do-cliente + resposta-do-
   humano-no-handoff é o rascunho mais valioso que existe (é o dono ensinando com a própria resposta).
2. **Pergunta recorrente:** a mesma dúvida aparece em N conversas sem bater em documento. Vira um
   rascunho de FAQ, com contagem de ocorrências como prioridade.
3. **Correção explícita:** quando o atendente humano corrige o que a IA disse, a correção vira rascunho.

Cada rascunho entra em `documentos` com `status = 'rascunho'`, `origem = 'realimentado'`, apontando a
`conversa_id`/`mensagem_id` de fonte (para o dono auditar o contexto) e um `hash_conteudo` para dedup.

### Curadoria, aprovação e versionamento

- **Nada embeddado sem aprovação do dono.** O `base_conhecimento` ativo (indexado) só recebe o que o
  dono aprovou na tela de curadoria (`api/modules/conhecimento`). Esse é um requisito já posto no
  BANCO.md ("aprovado pelo dono") e vira processo.
- **Versionamento:** editar um documento aprovado **não** faz UPDATE destrutivo; cria uma nova versão
  (`versao`, `substitui_id`), arquiva a anterior (`status = 'arquivado'`) e dispara reembedding dos
  chunks daquela versão. Histórico preservado, índice sempre coerente com a versão ativa.
- **Dedup e antilixo:** ao promover, o sistema avisa se o `hash_conteudo` ou a similaridade vetorial
  bate forte com documento já existente (evita 15 FAQs quase iguais). Rascunho tem TTL: o que ninguém
  aprova em X dias some da fila.

### Como evitar realimentar dado ao-vivo defasado (a trava crítica)

Antes de um rascunho poder ser promovido, um **validador determinístico** o rejeita ou marca se ele
cheira a dado vivo: presença de preço em reais, "R$", "hoje", "agora", "esgotado", "disponível",
status de pedido, número de telefone/Pix. A ideia vem direto da prática de cache semântico (classificar
a pergunta antes de servir do cache): aqui classificamos o **documento** antes de deixá-lo entrar na
base. Um rascunho que diga "o X-Tudo custa R$ 32" é barrado por construção, porque preço é coluna, não
documento. Isso fecha o buraco onde a realimentação envenenaria a base com um número que muda.

Resumo da trava tripla: **validador** (barra dado vivo) + **aprovação humana** (barra erro de conteúdo)
+ **versionamento** (mantém o índice coerente e reversível).

---

## 4. Isolamento multi-tenant e segurança

Isolamento de loja é obrigatório e aqui ele é **imposto no SQL**, não na confiança do modelo.

- **Retrieval só vê a loja da conversa.** Toda query de retrieval carrega
  `WHERE loja_id = $conversa.loja_id`, resolvido pelo `atendente` a partir da conversa (que veio do
  `phone_number_id` do inbound), **nunca** de qualquer texto vindo do cliente ou da saída do modelo. O
  `loja_id` não é parâmetro negociável: o modelo não o escolhe, não o vê, não o altera. Isso materializa
  **SEC-062** (contexto escopado à loja) e **SEC-002** (sem mass assignment de tenant).
- **Índice particionado por loja na prática.** `chunks.loja_id` indexado; o filtro entra **antes** do
  ranqueamento vetorial (pré-filtro), então um trecho de outra loja nunca é sequer candidato. Nada
  cruza loja mesmo que dois restaurantes tenham o mesmo prato.
- **Cache semântico com namespace por loja.** `cache_semantico.loja_id` sempre no lookup; uma resposta
  cacheada da loja A jamais serve a loja B.
- **A chave de LLM nunca entra no documento nem no prompt.** Conhecimento é texto do cardápio e regras;
  credencial não é conhecimento. A chave vai no header de auth do `ClienteLLM` (SEC-026), nunca no
  corpo do prompt, e a `base_conhecimento`/`chunks` não têm por que conter segredo. O validador de
  ingestão também barra entrada que pareça token/chave.
- **Saída do modelo é dado, não comando (SEC-061).** O que o RAG trouxe e o que o modelo respondeu não
  dispara ação (confirmar pedido, mudar preço, Pix) sem passar pelas regras determinísticas do fluxo.
  Trecho recuperado é contexto, nunca instrução executável, mesmo que um cliente malicioso tenha
  tentado plantar instrução num endereço ou nome.

### Decisão da chave: embedding é da plataforma, geração é BYO

Esta é a decisão mais contraintuitiva do documento e merece justificativa. O ARQUITETURA.md diz
"chave por loja (BYO key)". Isso vale com força para a **geração** (o custo caro e variável). Para
**embedding e rerank**, a recomendação é **provedor gerido pela plataforma**, não a chave da loja:

- **Razão decisiva (engenharia):** a dimensão do vetor é propriedade do índice. Se cada loja escolhesse
  o próprio modelo de embedding, o índice teria vetores de espaços e dimensões diferentes, e busca
  vetorial entre eles é incoerente. Fixar o modelo de embedding é condição para o índice funcionar.
- **Razão de custo:** embedding é ordens de grandeza mais barato que geração e o volume de ingestão é
  baixo (um cardápio muda devagar). O gasto de embedding da plataforma inteira é pequeno e previsível,
  ao contrário da geração por conversa. Não vale a complexidade de BYO para economizar centavos.
- **Como fica o BYO, então:** a geração da resposta ao cliente e a contextualização de chunk usam a
  **chave da loja** (centro de custo real, degrada para fluxo sem LLM se não configurada, como já
  previsto). Embedding e rerank usam a credencial da plataforma. O `uso_llm` contabiliza os três com
  um campo `tipo_uso` (`geracao`/`embedding`/`rerank`) para o painel e o alerta de gasto anômalo.
- Rejeitado: embedding por chave da loja (quebra a coerência do índice e não compensa em custo).

---

## 5. Qualidade e avaliação ("traz boas respostas?")

Sem medição, "melhorar o RAG" é chute. O whaviso precisa de um **conjunto de avaliação por loja** e de
métricas que separem as duas falhas possíveis: ou o retrieval não trouxe o trecho certo, ou trouxe e o
modelo respondeu mal.

### Conjunto de avaliação (golden set) por loja

Tabela `base_avaliacao`: pergunta real de cliente + resposta esperada + ids dos documentos que
*deveriam* ser recuperados, por loja. Duas fontes de alimentação, sem trabalho braçal:

1. **Semente curada:** 15 a 30 perguntas típicas por loja na ativação (o onboarding já conversa com o
   dono; aproveitar).
2. **Reaproveitar a realimentação:** todo par pergunta-cliente + resposta-humano aprovado na seção 3 é
   um caso de avaliação pronto. O loop de realimentação alimenta o golden set de graça.

### Métricas (e qual roda onde)

- **Retrieval (determinístico, barato):** `hit@k` e context recall (o documento esperado está entre os
  k recuperados?) e context precision. São comparações de id, sem LLM. **Rodam no gate do CI** sobre a
  semente de cada loja, porque são determinísticas e rápidas. Regressão de retrieval barra o merge.
- **Geração (LLM-as-judge, caro e não determinístico):** **faithfulness/groundedness** (a resposta se
  sustenta nos trechos recuperados? toda afirmação tem suporte?) e **answer relevance** (responde a
  pergunta?). Essas **não** entram no gate: são caras (cada eval multiplica chamadas de LLM) e
  nondeterminísticas, o que deixaria o CI flaky. Rodam **amostradas, offline/noturno**, com modelo
  juiz barato, e viram tendência para o dono/operador, não trava de PR.

Esta divisão (determinístico no CI, LLM-judge amostrado fora) é a recomendação central da seção: ela
pega regressão de retrieval cedo e barato, sem importar flakiness de juiz-LLM para o gate.

### Teste automatizado que entra no catálogo do SEGURANCA.md

Dois níveis, no espírito dos `SEC-###`:

- **Isolamento (segurança, gate):** **RAG-ISO-001**, extensão natural de **SEC-062**. Semeia duas lojas
  com documentos distintos e afirma que nenhuma consulta de retrieval da loja A retorna chunk da loja B,
  sob qualquer `loja_id` forjado no payload ou na saída do modelo. Determinístico, entra no gate.
- **Qualidade de retrieval (gate):** **RAG-EVAL-001**, roda `hit@k` sobre o golden set semente e falha
  se cair abaixo do limiar acordado. Determinístico, entra no gate.
- **Fidelidade (monitoramento, fora do gate):** **RAG-EVAL-002**, faithfulness/relevance amostrado,
  reportado, não bloqueante.

Assim a avaliação de RAG entra no mesmo mecanismo de "ameaça -> teste -> status" que o SEGURANCA.md já
define, com a parte determinística no CI e a parte cara como tendência vigiada.

---

## 6. Técnicas além do RAG (decisão por técnica)

Para cada técnica, a decisão e o porquê. O produto é sensível a custo (chave do cliente) e a latência
(cliente esperando no WhatsApp), e isso guia quase tudo.

- **Reranking:** **não no dia um, sim atrás de interface.** Corpus por loja é pequeno; híbrido + RRF já
  coloca o trecho certo no topo na maioria dos casos. Reranker custa latência e dinheiro por busca.
  Entra **quando a avaliação (seção 5) mostrar top-k errando** e, aí, como **API gerida (Cohere Rerank
  multilíngue, bom em pt-BR)** atrás de `ClienteReranker`, não self-hosted. *Por que não pgvector sozinho
  basta sempre:* em lojas com cardápio grande e muitos nomes colidentes, RRF pode ranquear mal; o
  cross-encoder resolve. *Por que API e não local:* não temos GPU, o volume por busca é baixo e o custo
  por busca é de centavos; manter um modelo de reranker rodando não se paga. A implementação nula por
  padrão mantém o custo em zero até a avaliação pedir.

- **Query rewriting:** **sim, versão leve.** Mensagem de WhatsApp é curta, cheia de gíria e vem de STT
  ruidoso; reescrever o turno numa consulta autônoma (usando as últimas mensagens da conversa) melhora
  o retrieval sem chamada dedicada, dentro do `entender_mensagem`. **Rejeitado HyDE** (gerar documento
  hipotético para então buscar): adiciona uma geração inteira de latência e custo para ganho marginal
  num corpus pequeno.

- **GraphRAG:** **rejeitado.** Serve a perguntas globais sobre corpus ("quais os temas do acervo") e a
  relações entre entidades num grande grafo. Um cardápio de um restaurante não é isso; o custo de
  construir e manter o grafo não tem retorno aqui.

- **RAG agêntico (loop multi-hop de retrieval):** **rejeitado como loop de busca; aceito como tool-use.**
  O atendente **é** agêntico no sentido de chamar ferramenta para dado vivo (consultar preço/esgotado),
  mas **não** faz múltiplas rodadas de retrieval encadeadas: isso adiciona segundos de latência que o
  cliente sente no chat e multiplica o custo da chave da loja. Retrieval é uma passada híbrida.

- **Cache semântico:** **sim, com trava rígida.** Mantém `cache_semantico`, mas **só para perguntas de
  resposta estável** (horário, formas de pagamento, "fazem entrega?"). **Nunca** cacheia resposta que
  contém preço, disponibilidade ou status. Limiar de similaridade **alto (0.97+)**, porque pergunta
  negada/invertida fica perto no espaço vetorial e tem resposta oposta. TTL curto, namespace por loja,
  classificação da pergunta antes de servir do cache. É economia direta na chave da loja em perguntas
  repetidas, sem risco de servir número velho (porque número não é cacheado).

- **Prompt caching:** **sim, onde o prefixo é estável.** Dois usos: (a) na **contextualização de chunk**
  na ingestão, cacheando o documento inteiro enquanto se gera o contexto de cada trecho (desconto alto
  no token relido, é o que torna o Contextual Retrieval barato); (b) no **system prompt + regras da
  loja** do atendimento, que são estáveis entre turnos da mesma loja. Alavanca de custo mais barata que
  existe e não muda a qualidade. Sujeito ao que o provedor BYO da loja suporta (OpenRouter/Anthropic).

- **Few-shot / prompt engineering:** **sim, é o baseline.** Poucos exemplos bons de diálogo de pedido
  no system prompt resolvem tom e formato sem custo de treino. É a primeira coisa a ajustar antes de
  pensar em fine-tuning.

- **Structured output / tool-use para dado ao-vivo:** **sim, é o par obrigatório do RAG.** O modelo
  pede preço/disponibilidade/status por **ferramenta com saída estruturada** (schema validado por Zod,
  como o resto da api), e a resposta vem da tabela, não da memória. É isto que mantém a seção 1 honesta:
  dado vivo sempre do sistema. Também é onde a montagem de pedido vira estrutura checável, não texto solto.

- **Fine-tuning:** **não agora; talvez destilação de formato no futuro.** Fine-tuning fixa peso em tempo
  de treino, então serve a **comportamento** (tom, formato), não a **conhecimento** (que muda e é por
  loja). Conhecimento por loja é exatamente o que o RAG resolve sem retreino. Além disso, a chave é BYO
  por loja: não dá para assumir um modelo fino único. Só reconsiderar se, com volume alto e muito
  estável, um modelo pequeno destilado para o **formato de diálogo de pedido** (não para o cardápio)
  baratear a geração; seria destilação de comportamento, plataforma, não por loja, e só com a avaliação
  provando o ganho. Por ora, few-shot + prompt caching cobrem o mesmo com custo zero de treino.

- **Destilação:** **não agora**, mesma lógica do fine-tuning; é a rota de otimização de custo *depois*
  que o produto tiver volume e um formato de resposta estabilizado, nunca antes de ter a avaliação.

**Ordem de adoção recomendada:** (1) híbrido + RRF + Contextual Retrieval + tool-use para dado vivo +
few-shot + prompt caching + cache semântico travado. (2) query rewriting leve. (3) reranker por API
*quando a avaliação pedir*. (4) destilação de formato *se* o volume justificar. Fine-tuning e GraphRAG
ficam fora do roadmap previsível.

---

## 7. Deltas propostos (para integrar depois; NÃO editei BANCO.md nem ARQUITETURA.md)

### 7.1 Deltas para o BANCO.md

O `base_conhecimento` + `cache_semantico` de hoje são o ponto de partida; o RAG exige separar
**documento** (unidade curável e versionada pelo dono) de **chunk** (unidade embeddada), mais as
tabelas de realimentação e avaliação. Proposta de migration dedicada (ex.: `0013_rag`), depois do
baseline, pelo acoplamento com `credenciais_llm`/`uso_llm`.

- **`documentos`** (evolução de `base_conhecimento` para a camada curável):
  `id`, `loja_id`, `tipo` (`descricao`/`regra`/`faq`/`politica`), `titulo`, `conteudo` text,
  `status` (`rascunho`/`aprovado`/`arquivado`), `origem` (`manual`/`importado`/`realimentado`),
  `versao` int, `substitui_id` (self-FK, cadeia de versões), `fonte_conversa_id`, `fonte_mensagem_id`
  (auditar rascunho realimentado), `hash_conteudo` (dedup), `criado_por`, `aprovado_por`, `aprovado_em`,
  `criado_em`. RLS por loja no padrão; `whaviso_api` escreve (curadoria), `whaviso_atendente` lê
  aprovados + insere rascunhos.
- **`chunks`** (unidade de retrieval, dona do vetor):
  `id`, `documento_id` (FK), `loja_id` (desnormalizado para pré-filtro), `ordem`, `texto`,
  `texto_contextualizado` (com o prefixo do Contextual Retrieval), `embedding vector(dim)`,
  `tsv tsvector` (coluna gerada, config `portuguese`), `embedding_model`, `token_count`, `criado_em`.
  Índices: **HNSW** em `embedding`, **GIN** em `tsv`, btree em `loja_id`. Reembeddar = regerar os chunks
  da versão ativa do documento.
- **`base_avaliacao`** (golden set por loja): `id`, `loja_id`, `pergunta`, `resposta_esperada`,
  `docs_esperados` (uuid[]), `tipo`, `ativo`, `origem` (`semente`/`realimentado`), `criado_em`.
- **`rag_feedback`** (fila da realimentação): `id`, `loja_id`, `conversa_id`, `mensagem_id`,
  `tipo` (`lacuna`/`recorrente`/`correcao_humana`), `texto`, `ocorrencias` int, `status`
  (`novo`/`triado`/`promovido`/`descartado`), `documento_rascunho_id`, `criado_em`. Append-only.
- **`cache_semantico`** (deltas): garantir `loja_id` no lookup, `pergunta_embedding vector(dim)`,
  `resposta`, `expira_em` (TTL), `contem_dado_vivo boolean` (invariante: sempre `false`; guarda contra
  bug), `embedding_model`, `acertos` int. Índice HNSW no embedding, filtro por `loja_id` + não-expirado.
- **`uso_llm`** (delta): campo `tipo_uso` (`geracao`/`embedding`/`rerank`) para contabilizar as três
  classes e separar o que é BYO (geração) do que é plataforma (embedding/rerank) no painel e no alerta.
- **Nota de credencial:** embedding/rerank **não** usam `credenciais_llm` (chave por loja); usam a
  credencial da plataforma (fora do escopo de `credenciais_llm`). Documentar essa separação no BANCO.md
  para o grant de `credenciais_llm.chave_cifrada` continuar restrito ao uso de geração do `atendente`.

### 7.2 Deltas para o ARQUITETURA.md

- **`atendente/shared/rag/`:** detalhar as subpeças `retriever`, `ingestor`, e as interfaces
  `ClienteEmbeddings` (provedor de plataforma, dimensão fixa) e `ClienteReranker` (default nulo, Cohere
  plugável), ao lado do `ClienteLLM` (geração + contextualização de chunk, BYO por loja).
- **`atendente/modules/entender_mensagem/`:** acrescentar a **reescrita de consulta** como passo do
  módulo (não módulo novo).
- **`atendente/modules/retroalimentar_base/`:** fixar o contrato "produz só rascunho em `documentos`,
  nunca embedda sem aprovação"; o embedding é da ingestão, disparada por evento de aprovação.
- **`api/modules/conhecimento/`** (**módulo novo**, plano da loja): curadoria, aprovação, versionamento
  e o golden set (`base_avaliacao`). A `api` não embedda; ao aprovar, enfileira no outbox e o `atendente`
  faz a ingestão. Preserva "módulo não importa módulo" e a fronteira api/worker.
- **Fluxo de ingestão por outbox:** aprovar documento na `api` -> evento -> `atendente` (role
  `whaviso_atendente`) chunk+contextualiza+embedda+grava. Mesma espinha de integração por banco
  compartilhado já adotada (sem fila/Redis).
- **Catálogo de avaliação:** registrar `RAG-ISO-001`, `RAG-EVAL-001` (gate, determinísticos) e
  `RAG-EVAL-002` (monitoramento) na suíte, alinhados ao `SEC-062`.

---

## Fontes

Estado da prática de RAG em 2025-2026 (blogs de fornecedor/consultoria e alguns papers; números são
indicativos):

- Retrieval híbrido (BM25 + vetor), RRF e reranking em Postgres/pgvector:
  [Ubuntu/Canonical, "Hybrid search and reranking: a deeper look at RAG"](https://ubuntu.com/blog/hybrid-search-and-reranking-a-deeper-look-at-rag);
  [Mayflower, "Hybrid Retrieval in PostgreSQL"](https://blog.mayflower.de/?p=29660);
  [wz-it, "Hybrid search and reranking for RAG"](https://wz-it.com/en/knowledge/ki/hybrid-search-reranking/);
  [dbi-services, "RAG series: hybrid search with re-ranking"](https://www.dbi-services.com/blog/rag-series-hybrid-search-with-re-ranking/).
- Contextual Retrieval (contextual embeddings + contextual BM25 + reranking):
  [Maginative, "Anthropic's Contextual Retrieval Technique"](https://www.maginative.com/article/anthropics-contextual-retrieval-technique-enhances-rag-accuracy-by-67);
  [InfoQ, "Anthropic Contextual Retrieval"](https://www.infoq.com/news/2024/09/anthropic-contextual-retrieval/);
  [freeCodeCamp, "How contextual embeddings and hybrid search fix retrieval failures"](https://freecodecamp.org/news/how-contextual-embeddings-and-hybrid-search-fix-retrieval-failures).
- GraphRAG vs vanilla vs agêntico e query rewriting:
  [arXiv, "Is GraphRAG Needed?"](https://arxiv.org/abs/2606.25656);
  [alphaXiv, "Do We Still Need GraphRAG?"](https://www.alphaxiv.org/abs/2604.09666);
  [Starmorph, "RAG techniques compared"](https://blog.starmorph.com/blog/rag-techniques-compared-best-practices-guide).
- Avaliação de RAG (faithfulness, context precision/recall, golden set, custo de LLM-judge):
  [PremAI, "RAG Evaluation: Metrics, Frameworks & Testing (2026)"](https://blog.premai.io/rag-evaluation-metrics-frameworks-testing-2026);
  [getwidget, "RAG Benchmark Methodology 2026"](https://getwidget.dev/blog/rag-benchmark-methodology/);
  [dev.to, "RAG Evaluation Metrics Guide 2026"](https://dev.to/dublecc/rag-evaluation-metrics-guide-2026-faithfulness-context-precision-and-how-to-score-a-pipeline-46gi).
- Fine-tuning vs RAG vs prompt caching vs few-shot:
  [wavect, "RAG vs finetune vs long context 2026"](https://wavect.io/blog/rag-vs-finetune-vs-longcontext-2026/);
  [PremAI, "Fine-Tuning vs RAG: A Decision Framework"](https://blog.premai.io/fine-tuning-vs-rag-a-decision-framework-for-custom-llm-applications);
  [MachineLearningMastery, "Prompt Caching vs Fine-Tuning"](https://machinelearningmastery.com/prompt-caching-vs-fine-tuning-a-cost-and-latency-decision-framework/).
- Cache semântico em Postgres/pgvector (limiar, dado volátil, TTL):
  [pgEdge, "Volatile queries and semantic caching"](https://www.pgedge.com/blog/volatile-queries-and-semantic-caching-how-to-make-sure-it-always-returns-the-right-answer);
  [pgEdge, "pg_semantic_cache in production"](https://www.pgedge.com/blog/pg_semantic_cache-in-production-tags-eviction-monitoring-and-python-integration).
- Rerankers multilíngues (Cohere API vs self-hosted):
  [FutureAGI, "Best rerankers for RAG 2026"](https://futureagi.com/blog/best-rerankers-for-rag-2026/);
  [SiliconFlow, "Best Reranker for Multilingual Search in 2026"](https://www.siliconflow.com/articles/best-reranker-for-multilingual-search).
