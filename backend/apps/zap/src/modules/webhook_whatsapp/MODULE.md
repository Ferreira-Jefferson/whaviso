# webhook_whatsapp

## Propósito
Ingestão do inbound do WhatsApp (Meta Cloud API) pelo webhook HTTP
(`POST /webhook/whatsapp`, montado pelo `meta_client`). Esqueleto pós-pivô: só os recibos
de status estão ligados; o inbound de pedidos (texto/áudio) será reescrito.

## Entry points
- `index.ts` → `registrarInboundWhats(deps)`: chamado por `src/server.ts`.
- `service.ts` → `processarStatus`, `reivindicarEvento` (idempotência por wamid).

## Tabelas
- escreve em: envios (entrega_status), webhook_eventos_processados
