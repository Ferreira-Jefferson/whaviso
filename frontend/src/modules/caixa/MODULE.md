# caixa (frontend)

## Propósito
PDV / caixa físico do restaurante. O dono abre o caixa (saldo inicial em dinheiro), registra
vendas por forma de pagamento, sangrias e suprimentos, e fecha conferindo o valor contado na
gaveta contra o esperado. Mostra o relatório da sessão aberta. Rota `/caixa` (grupo painel).

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/caixa'))` no registry de rotas).

## Dados
- `GET /v1/caixa/aberto` (sessão aberta ou `{ caixa: null }`), `POST /v1/caixa/abrir` (abrir),
  `POST /v1/caixa/:id/movimentos` (venda | sangria | suprimento), `POST /v1/caixa/:id/fechar`
  (fechar com saldo informado) e `GET /v1/caixa/:id/relatorio` (totais por forma, vendas,
  sangrias, suprimentos, saldo esperado em dinheiro e movimentos).
- Contratos: `@/shared/contracts/_generated/caixa` (não redefinir enums `formaPagamento`,
  `tipoMovimentoCaixa`, `statusCaixa`).
- Cache: raiz `['caixa']`; cada mutação invalida essa raiz. O relatório é buscado para a
  sessão aberta (`['caixa','relatorio', id]`, `enabled` só com `id`).

## Dinheiro
- Sempre em **centavos** (int). Entrada por `MoneyInput`, exibição por `MoneyText` /
  `formatarCentavos` (únicos pontos de conversão). O `valor` de venda/sangria/suprimento é
  positivo; o `ajuste` (negativo possível) nasce do fechamento no servidor, não desta tela.

## Fechamento
- O dialog mostra a **diferença prevista** (informado - esperado em dinheiro) enquanto o
  usuário digita, apenas como apresentação. O cálculo oficial (`saldo_calculado`, `diferenca`)
  vem do servidor na resposta do fechar e é resumido num toast.

## Estados
- loading (skeletons), empty (nenhum caixa aberto, com ação de abrir), error (`ErrorState`
  com tentar de novo). Mobile-first; alvos de toque de 44px via primitivos do design system.

## Notas
- Não há primitivo novo: a tela usa só `@/shared/ui` (Button, Card, Field, Input, MoneyInput,
  MoneyText, Dialog, SegmentedControl, Badge, StatCard, EmptyState, ErrorState, Skeleton,
  PageHeader, useToast, cn). Módulo não importa módulo; não importa `@whaviso/shared`.
