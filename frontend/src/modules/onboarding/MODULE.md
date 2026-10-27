# onboarding (frontend)

## Proposito
Pagina `/onboarding`: checklist guiado de configuracao da loja (perfil, numero, cardapio, primeiro
pedido) com barra de progresso, atalho para cumprir cada etapa pendente e o tempo ate o primeiro pedido.

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/onboarding'))`).
- `components/ChecklistOnboarding.tsx`: o checklist, reaproveitavel como widget dentro do modulo.

## Dados (`api.ts`, raiz `['onboarding']`)
- `GET /v1/onboarding` (permissao `loja:gerir`). Contrato `_generated/onboarding`. Somente leitura.

## Notas
- Etapas, progresso e tempo vem do servidor; o cliente nunca calcula "etapa feita".
- Os destinos das etapas (`/lojas`, `/numeros`, `/cardapio`, `/pedidos`) sao rotas do registry, usadas por `Link` (nao import de modulo).
