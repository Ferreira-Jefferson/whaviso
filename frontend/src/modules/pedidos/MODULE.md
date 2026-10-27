# pedidos (frontend)

## Propósito
Kanban operacional de pedidos da loja ativa: colunas novo, em preparo, saiu para entrega, entregue e problema.
Cards com código, cliente, total, tempo, modalidade e ações de transição. Rota `/pedidos`.

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/pedidos'))` no registry de rotas).

## Dados
- `GET /v1/pedidos` (kanban, filtros modalidade/origem/data) e `POST /v1/pedidos/:id/status`.
- Contratos: `@/shared/contracts/_generated/pedidos` (não redefinir).
- Cache: raiz `['pedidos']`. O realtime (`pedido.atualizado`) invalida essa raiz via `MAPA_INVALIDACAO`;
  a página também assina o evento só para destacar o card que mudou.

## Notas
- Os destinos de cada card vêm do servidor (`destinos`); o cliente nunca decide a transição.
- Motivo é obrigatório para `problema` (dialog próprio).
- Mock aprovado: `docs/pivot/mocks/pedidos/index.html`.
