# plataforma_evals

## Proposito
Central de Evals do operador Whaviso: gerir suites e casos de teste da LLM e do RAG do atendente,
enfileirar execucoes contra uma loja alvo, ler resultados e comparar duas execucoes (B menos A).
A api so ENFILEIRA e le; o runner do atendente drena a fila, executa e grava `resumo` e
`eval_resultados`.

## Entry points
- `index.ts`: `plataformaEvalsRoutes` (registry, prefixo `plataforma-evals`) e
  `criarPlataformaEvalsRoutes()` (testes).
- Rotas (`/v1/plataforma-evals`): `GET|POST /suites`, `PATCH /suites/:id`, `GET|POST /suites/:id/casos`,
  `PATCH /casos/:id`, `GET /lojas-alvo`, `POST|GET /execucoes`, `GET /execucoes/:id`,
  `POST /execucoes/comparar`, `POST /execucoes/baseline`, `POST /execucoes/:id/cancelar`.

## Escopo / permissoes
- Toda rota: `config.acesso = 'plataforma'` + `[autenticar, escopoOperador, exigirPermissao(...)]`.
  Membro de loja recebe 403. Leituras (incluindo `comparar`) exigem `evals:ver`; escritas e
  disparo exigem `evals:rodar`. Chaves no catalogo (`shared/tenant/catalogo.ts`) e na migration 0091.
- `lojaAlvoId` e so o seletor da loja que a execucao mira, nunca escopo de auth.

## Regras
- `tipo` da suite e imutavel. `entrada`/`esperado` de caso sao validados no service contra
  `evalPayloadPorTipo[suite.tipo]` (400 `entrada_invalida`); o PATCH revalida pelo tipo da suite dona.
- Enfileirar: status `fila`, `disparada_por` = user do operador. Cancelar so de `fila` (atomico; senao 409).
- Baseline: so entre execucoes da mesma suite e distintas.
- Diff por caso ignora resultados sem `caso_id` (rag_retrieval).
- Logica pura de comparacao em `metricas.ts`.

## Tabelas
- escreve: `eval_suites`, `eval_casos`, `eval_execucoes` (insert, cancelar, baseline; sem DELETE).
- le: `eval_resultados`, `lojas` (`id`, `nome`).
- PROIBIDAS (guarda em `fronteira.test.ts`): tabelas de conteudo e uso de loja.

## Contratos
- `packages/shared/src/contracts/plataforma_evals.ts` (reexportados por `schemas.ts`).
