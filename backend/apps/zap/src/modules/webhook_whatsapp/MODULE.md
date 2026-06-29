# webhook_whatsapp

## Propósito
Ingestão do inbound do WhatsApp (Meta Cloud API): processa cliques nos botões
(ja_paguei/optout/ver_pix/aceite/recusa, idempotentes por estado) e responde a
confirmação na janela de 24h. Os cliques, textos e recibos de status chegam pelo
**webhook HTTP** da Meta (`POST /webhook/whatsapp`, montado pelo `meta_client`), que
despacha aos handlers ligados aqui. A lógica é agnóstica de transporte.

## Entry points
- `index.ts` → `registrarInboundWhats(deps)`: chamado por `src/server.ts`, que liga
  `whats.onBotao/onTexto/onStatus(...)` aos `processarBotao/processarTexto/processarStatus`.
- `service.ts` → `processarBotao(deps, evento)`: núcleo agnóstico de transporte.

## Especialistas consumidos
- `@whaviso/shared/db`
- `shared/whats` (ClienteWhats: enviarTexto p/ a confirmação 24h; EventoBotao/Texto/Status)

## Tabelas
- escreve em: avisos (transição via botão), eventos_aviso, notificacoes_cobrador (outbox)

## Notas
- Recibos de entrega (sent/delivered/read/failed) chegam por `statuses[]` no webhook e
  `processarStatus` os grava em `envios.entrega_status` (via `repo.atualizarEntrega`).
