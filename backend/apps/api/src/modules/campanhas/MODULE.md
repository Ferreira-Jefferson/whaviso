# campanhas

## Proposito
Disparo de campanha de WhatsApp da loja sobre o consumidor final (marketing/relacionamento). Cria a
campanha (nome, template, numero de origem, filtro de segmento, variaveis fixas), calcula o publico
a partir do CRM EXCLUINDO opt-out e enfileira os envios na outbox `envios` como TEMPLATE aprovado.
Acompanha o estado por campanha e por destinatario.

## Entry points
- `index.ts`: `campanhasRoutes`. Rotas finais (`/v1/campanhas`):
  - `POST /` cria (rascunho) `{ nome, template_chave, numero_whatsapp_id, filtro, variaveis }`.
  - `GET /` lista as campanhas da loja.
  - `GET /:id` detalhe (status, totais, variaveis, resumo de entrega lido de `envios`).
  - `GET /:id/destinatarios` estimativa do publico (quantos recebem, ja sem opt-out).
  - `POST /:id/disparar` valida template/variaveis/numero e enfileira (so em `rascunho`).
  - `POST /:id/cancelar` aborta os envios ainda nao enviados na outbox.

## Tabelas
- dono de: `campanhas` e `campanha_envios` (migration 0038; SELECT/INSERT/UPDATE, sem DELETE).
- produz em: `envios` (outbox; so ENFILEIRA, nunca fala com a Meta nem importa o zap/crm).
- le de: view `clientes_metricas` (publico-alvo + opt-out), `clientes` (so `telefone_hash`, p/ o
  `envios.destinatario_hash`; nunca o telefone em claro), `templates`, `numeros_whatsapp` (via SQL).
- escreve: `eventos` (`campanha.criada`/`disparada`/`cancelada`, `detalhes` so com user_id e totais).

## Compliance / seguranca (SEC-110, SEC-111)
- Campanha NUNCA cruza loja: `loja_id` do escopo em toda consulta/linha; numero e destinatarios so
  da propria loja (teste cross-loja: 404 + nenhum cliente/numero de outra loja entra).
- Opt-out e primeira classe: o publico sai de `clientes_metricas.opt_out_marketing = false` (REUSO
  do criterio `contactavel` do CRM); quem recusou marketing NUNCA e enfileirado.
- So dispara por TEMPLATE aprovado pela Meta e ativo (`status_meta = 'aprovado'`). O envio e sempre
  `{ tipo: 'template', template, variaveis }` com `template_chave` setado: o caminho sancionado fora
  da janela de 24h. Texto livre nao existe em campanha.
- Nunca loga telefone nem hash (o telefone nem e lido aqui; o hash so trafega dentro do SQL).

## Permissoes
- Tudo por `loja:gerir` (dono/gerente). O atendente NAO gere campanhas (marketing, nao turno).

## Idempotencia
- Disparo so em `rascunho` (re-disparo = 422 `campanha_nao_disparavel`). O enqueue usa dedupe
  `campanha:<id>:<cliente>` em `envios` + unique `(campanha_id, cliente_id)` em `campanha_envios`.

## Contratos
- Zod em `@whaviso/shared/contracts/campanhas` (fonte unica; reemitido para o front pelo codegen).
  `schemas.ts` reexporta e adiciona o `IdParams` de rota.
