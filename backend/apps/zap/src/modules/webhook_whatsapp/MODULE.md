# webhook_whatsapp

## Proposito
Inbound do WhatsApp (Meta Cloud API). Recebe o webhook, valida a assinatura, roteia pelo
`phone_number_id` ate a loja, persiste a mensagem de entrada (idempotente por `wamid`) e aplica
os recibos de status aos `envios`. Trabalho fino: a interpretacao do inbound fica no atendente.

## Entry points
- `index.ts` (`registrarWebhookWhatsapp(app, deps)`): liga GET/POST `/webhook/whatsapp` no app
  (chamado pelo app-root em `src/app.ts`, nao por `routes.ts`, porque precisa de cifra/assinatura
  injetadas). Reexporta `processarWebhook` para os testes de integracao.

## Especialistas consumidos
- `@whaviso/shared/db` (`comTransacao`, `consultar`/`sql`, `notificar`)
- `@whaviso/shared/cifra` (hash/cifra do telefone do remetente)
- cliente endurecido `shared/meta_client` (so `verificarAssinatura`, injetado via deps)

## Tabelas
- escreve: `webhook_eventos_processados` (insert), `clientes` (insert), `conversas`
  (insert + update `ultima_entrada_em`), `mensagens` (insert de entrada), `envios`
  (update so das colunas de outbox: `status`, `entrega_status`, `erro`, SEC-031)
- le de: `numeros_whatsapp` (resolver loja por `phone_number_id`)

## Contratos
- consome: evento realtime `conversa.mensagem` (`@whaviso/shared/contracts`), emitido no inbound
  (referencia, sem PII).

## Decisoes
- Idempotencia por `wamid` so para mensagens de entrada; recibos de status sao idempotentes pelo
  proprio UPDATE (monotonico: sent < delivered < read; failed marca status/erro).
- Persiste ANTES de responder 200 (a Meta reentrega sem 200). Sem MASTER_KEY, mensagens nao
  persistem (wamid nao reivindicado, para reentrega); recibos seguem.
- Sinal ao atendente por claim no banco fica para quando `mensagens` ganhar coluna de estado de
  processamento (migration futura); hoje o sinal ao painel e o evento realtime.
