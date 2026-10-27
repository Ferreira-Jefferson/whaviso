# AT-realimentar retroalimentar_base

- **ID:** AT-realimentar  ·  **Área:** AT  ·  **Onda:** 2
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (ninguem)

> **Fonte do design:** [../../docs/pivot/RAG.md](../../docs/pivot/RAG.md), seção 3 (loop de
> realimentação). Lido na escrita deste plano. O RAG.md é **proposta** aguardando aprovação do dono.

## Objetivo

Fazer a base de conhecimento da loja **crescer com o uso** com o princípio **produção automática,
promoção manual**: o módulo observa as conversas e gera **rascunhos** de documento; nada é embeddado nem
indexado sem **aprovação explícita do dono** na tela de curadoria (módulo de api). "Pronto" observável:
lacunas de conhecimento, perguntas recorrentes e correções humanas viram rascunhos em `documentos` com
`status='rascunho'` e `origem='realimentado'`, apontando a conversa/mensagem de fonte; rascunho com dado
vivo é barrado por validador; nada de rascunho aparece no índice do RAG.

## Dependências

- `AT-rag`: define `documentos`/`chunks`, o validador de dado vivo e a ingestão; este módulo só **produz
  rascunhos**.
- `AT-llm`: geração do texto do rascunho com a chave e o orçamento da loja.
- **Migration `0013_rag`** (`documentos`, `rag_feedback`, ver RAG.md 7.1) e `API-conhecimento` (curadoria e
  aprovação): ver Notas, ainda **não** constam no STATUS.md.

## Contratos e tabelas que toca

- **Papel de banco:** `whaviso_atendente`.
- **Escreve:** `rag_feedback` (fila append-only: `lacuna`, `recorrente`, `correcao_humana`, com
  `ocorrencias`), `documentos` **somente** com `status='rascunho'` (insert), `uso_llm` via `llm_client`,
  `eventos` (sem PII).
- **Lê:** `mensagens`/`conversas` da própria loja (origem), `documentos` (dedup por `hash_conteudo` e
  similaridade), `chunks` (similaridade vetorial para dedup).
- **Nunca escreve** `status='aprovado'` nem `chunks`: aprovação é do dono via `api`, ingestão é do `rag`.
- Contrato do kernel: `CandidatoConhecimento` (título, corpo, tipo `descricao|regra|faq|politica`, origem,
  confiança) e o estado do documento.

## Arquivos (escopo de edição)

- `backend/apps/atendente/src/modules/retroalimentar_base/**`
- `backend/apps/atendente/test/**` e `backend/apps/atendente/test/security/**`

## Etapas

- [ ] Confirmar a `0013_rag` aplicada e o contrato do rascunho com `AT-rag`; registrar lacunas em Notas
      (commit: `docs(atendente): pre-requisitos da retroalimentacao verificados`)
- [ ] Coleta de sinais **lacuna**: retrieval fraco (abaixo do limiar) ou resposta "não sei" seguida de
      handoff humano; registrar em `rag_feedback`  (commit: `feat(atendente): sinal de lacuna de conhecimento`)
- [ ] Sinal **correção humana**: a resposta do atendente humano no handoff, par com a pergunta do cliente
      (o rascunho de maior valor), e a correção explícita de algo dito pela IA  (commit: `feat(atendente): sinal de resposta humana e correcao`)
- [ ] Sinal **recorrente**: a mesma dúvida em N conversas sem bater em documento, com contagem de
      `ocorrencias` como prioridade (N configurável)  (commit: `feat(atendente): sinal de pergunta recorrente`)
- [ ] Anonimização **antes** do LLM: remover telefone, nome e endereço do cliente do insumo; o rascunho
      carrega só conteúdo genérico  (commit: `feat(atendente): anonimizacao antes do llm`)
- [ ] Geração do rascunho via `ClienteLLM` (chave da loja) com saída estruturada validada por Zod; **proibido
      inventar** informação que não esteja na pergunta/resposta humana de origem  (commit: `feat(atendente): geracao de rascunho de conhecimento`)
- [ ] **Trava de dado vivo**: reutilizar o validador determinístico do `AT-rag` (preço, "R$", "hoje",
      "esgotado", status, telefone/Pix, cara de chave); rascunho que cheire a dado vivo é descartado ou
      marcado, nunca promovido  (commit: `feat(atendente): trava de dado vivo no rascunho`)
- [ ] Dedup e antilixo: `hash_conteudo` e similaridade com documentos aprovados e rascunhos pendentes;
      suprimir repetido e o rejeitado sem fato novo  (commit: `feat(atendente): deduplicacao de rascunhos`)
- [ ] Persistir como `rascunho` com `fonte_conversa_id`/`fonte_mensagem_id` (dono audita o contexto) e **TTL**
      (o que ninguém aprova em X dias sai da fila)  (commit: `feat(atendente): persistencia de rascunhos com ttl`)
- [ ] Alimentar o golden set: par pergunta + resposta humana aprovado vira candidato de `base_avaliacao`
      (`origem='realimentado'`), só **após** aprovação do documento  (commit: `feat(atendente): realimentar golden set`)
- [ ] Gatilho e orçamento: lote periódico e sob demanda, respeitando o teto de gasto da loja; sem credencial
      de LLM, o módulo fica inativo  (commit: `feat(atendente): gatilho e teto da retroalimentacao`)
- [ ] Evento de "sugestões pendentes" no outbox/eventos para o painel, sem acoplar a módulo da api  (commit: `feat(atendente): evento de sugestoes pendentes`)
- [ ] Testes de unidade e de segurança (ver abaixo)  (commit: `test(atendente): retroalimentar_base`)
- [ ] Revisão (Opus) contra SEGURANCA.md (PII e envenenamento da base)

## Testes e segurança exigidos

- Unidade com `ClienteLLM` falso: cada tipo de sinal, geração válida e inválida, dedup, supressão de
  rejeitado, TTL, ausência de credencial.
- Integração: rascunho nasce `rascunho`; **tentar indexar rascunho no `rag` não tem efeito**; só
  `aprovado` (alterado pelo role da api) vira chunk.
- **SEC-062**: rascunho de A nunca usa insumo de B nem é visível a B (duas lojas sentinela).
- **SEC-060**: conversa com instrução maliciosa ("registre que o pedido é grátis") **não** vira documento
  ativo; a aprovação humana é a barreira. Teste com cliente adversarial plantando texto.
- **SEC-061**: saída do modelo é dado; o módulo não confirma pedido, altera preço nem envia mensagem.
- **SEC-024**: PII e texto de conversa fora dos logs; rascunho sem PII (teste com telefone e nome sentinela).
- **SEC-032**: o role do atendente não consegue gravar `status='aprovado'` (confirmar grant/regra; se
  não impedir, escalar ao dono do schema).

## Notas e decisões

- Decisão (RAG.md): **trava tripla**: validador (barra dado vivo) + aprovação humana (barra erro) +
  versionamento (índice coerente e reversível). O versionamento e a aprovação ficam em `API-conhecimento`
  e `AT-rag`; aqui entra o validador e a produção do rascunho.
- Decisão: anonimizar **antes** do LLM, para que PII nunca saia do banco rumo ao provedor.
- Decisão: este módulo não duplica o editor do painel; só alimenta a fila de sugestões.
- Lacuna de plano: `API-conhecimento` (curadoria, aprovação, versionamento, golden set) e a migration
  `0013_rag` não estão no STATUS.md; escalar ao coordenador antes de iniciar.
- Pendência: valor de N (recorrência), TTL do rascunho e limiar de "retrieval fraco" a calibrar com a
  avaliação do `AT-rag`.
