# agendamento (frontend)

## Proposito
Pagina `/agendamento`: agenda dos pedidos marcados para data/hora futura. Filtra por janela
(`futuro`, `liberar`, `atrasado`), escolhe a antecedencia de liberacao, reagenda e torna imediato.

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/agendamento'))`).

## Dados (`api.ts`, raiz `['agendamento']`)
- `GET /v1/agendamento` (cursor, `janela`, `antecedencia_min`), `PUT /v1/agendamento/:pedidoId`,
  `DELETE /v1/agendamento/:pedidoId`. Permissao `pedidos:gerir`. Contrato `_generated/agendamento`.
- Toda mutacao invalida `['agendamento']`.

## Notas
- A janela e calculada pelo servidor; o cliente nao classifica pedidos.
- Horario digitado em `datetime-local` e lido como America/Sao_Paulo; enviado como ISO com offset `-03:00`
  (sem horario de verao). Exibicao via `@/shared/format` (`formatarData`/`formatarHora`).
- LACUNA: a API so lista pedidos que JA tem horario. Agendar um pedido ainda imediato (primeira vez) precisa
  partir do detalhe do pedido (modulo `pedidos`), que pode chamar `PUT /v1/agendamento/:pedidoId`.
