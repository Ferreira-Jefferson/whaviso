# webhook_whatsapp

## Propósito
Ingestão do inbound do WhatsApp (Baileys): processa cliques nos botões
(ja_paguei/optout/ver_pix/aceite/recusa, idempotentes por estado) e responde a
confirmação na janela de 24h. Os cliques chegam pelo **evento do socket** do
Baileys (não há mais webhook HTTP/HMAC da Meta).

## Entry points
- `index.ts` → `registrarInboundWhats(deps)`: chamado por `src/server.ts`, que liga
  `whats.onBotao(...)` ao `processarBotao` do `service.ts`.
- `service.ts` → `processarBotao(deps, evento)`: núcleo agnóstico de transporte.

## Especialistas consumidos
- `@whaviso/shared/db`
- `shared/baileys_client` (ClienteWhats: enviarTexto p/ a confirmação 24h; EventoBotao)

## Tabelas
- escreve em: avisos (transição via botão), eventos_aviso, notificacoes_cobrador (outbox)

## Notas
- Status de entrega (sent/delivered/read) no Baileys vem por evento do socket, não
  por webhook; `repo.atualizarEntrega` existe mas o wiring dos recibos é pendente.
