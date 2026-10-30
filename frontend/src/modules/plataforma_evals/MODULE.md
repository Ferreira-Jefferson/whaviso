# plataforma_evals (frontend)

## Proposito
Central de Evals do OPERADOR (equipe Whaviso): criar, executar, acompanhar e comparar evals da LLM e do
RAG do atendente. Espelha `backend/apps/api/src/modules/plataforma_evals`. Nao e tela de loja.

## Telas (`pages/Evals.tsx`, rota `/plataforma/evals`)
- Suites (`PainelSuites`, `SuiteDialog`): tipo e familia em selos, ativar/desativar, editar (tipo imutavel).
  Clique abre os casos (`PainelCasos`, `CasoDialog`); o formulario do caso adapta-se ao tipo da suite
  (`casoForm.ts`, validado com `evalPayloadPorTipo`). `rag_retrieval` nao tem casos (usa o golden set da loja).
- Execucoes (`PainelHistorico`, `NovaExecucaoDialog`, `DetalheExecucao`): filtros suite/modelo/status; a lista e o
  detalhe reconsultam sozinhos enquanto houver execucao na fila ou rodando. Detalhe: KPIs, score por metrica,
  resultados expansiveis (saida e erro), baseline, comparar e cancelar.
- Comparar (`Comparacao`): A x B, deltas sempre B menos A, diff por caso.
- Progressao (`Progressao`, `GraficoSerie` local): score medio (e hit@k) das ultimas 20 execucoes concluidas.

## Dados
- Prefixo `/v1/plataforma-evals`. Contratos: `@/shared/contracts/_generated/plataforma_evals`; o seletor
  `lojas-alvo` tem schema local em `schemas.ts`. Cache raiz `['plataforma_evals']`.
- Toda chamada e de operador: `semLoja: true` (sem `x-loja-id`).

## Primitivos locais
`AreaErro` (403 -> acesso restrito), `rotulos.ts` (rotulos pt-BR, pct/reais/ms), `GraficoSerie` (CSS puro, sem lib).
