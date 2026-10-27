# custos (frontend)

## Propósito
Painel de custos externos da loja (IA, WhatsApp, mapas, fiscal): total, média por dia, dia de pico,
por categoria, por dia, por origem e razão de eventos. Rota `/custos` (grupo painel). Somente leitura.

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/custos'))`).

## Dados
- `GET /v1/custos/resumo` e `GET /v1/custos/eventos` (cursor, `categoria`). Não usa as rotas de
  operador `/custos/plataforma/*`.
- Contratos: `@/shared/contracts/_generated/custos`. Cache: raiz `['custos']`.
- Exige `loja:gerir`. Períodos 7, 30 e 90 dias (limite da api: 92 dias).

## Notas
- Eventos não trazem conteúdo, telefone nem texto livre (só categoria, origem, valor, quantidade).
- Dinheiro em centavos (pode ser fração de real por evento).
