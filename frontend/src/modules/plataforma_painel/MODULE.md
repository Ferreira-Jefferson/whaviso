# plataforma_painel (frontend)

## Proposito
Console do OPERADOR (equipe Whaviso): painel de crescimento da base de clientes. Espelha
`backend/apps/api/src/modules/plataforma_painel`. Nao e tela de loja.

## Telas
- `pages/Painel.tsx`: KPIs do mes (MRR, ARPA, lojas/contas ativas, novas contas, churn de contas e de MRR,
  conversao de funil e de trial, receita realizada, inadimplencia, assinaturas por situacao) e serie mensal
  (grafico de barras do MRR + tabela) com periodo 6/12/24 meses.

## Dados
- `GET /v1/plataforma-painel/resumo`, `GET /v1/plataforma-painel/serie?meses=1..24`.
- Contratos: `@/shared/contracts/_generated/plataforma_painel`. Cache raiz `['plataforma_painel']`, staleTime 60 s.
- Rotas de operador: chamadas com `semLoja: true` (sem `x-loja-id`).

## Regras de exibicao
- Razao `null` = "Sem base" (nunca "0%" falso). Dinheiro em centavos via `brl`/`MoneyText`.
- Serie com `mrr_aproximado` mostra aviso. `calculado_em` aparece como "Atualizado em".
- So agregados: nenhuma metrica de uso de loja (SEC-003).
- 403 (usuario nao e operador) vira "Acesso restrito a equipe Whaviso" (`components/AreaErro.tsx`).

## Primitivos locais
`Kpi` (StatCard so mostra dinheiro), `GraficoSerie` (barras verticais CSS), `AreaErro`.
