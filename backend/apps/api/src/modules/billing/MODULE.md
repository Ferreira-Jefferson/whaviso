# billing

## Propósito
Planos, assinatura e estrutura de pagamento (Épico 11). Catálogo de 4 planos
(free/start/profissional/plus) com a AGENDA como balde único e alavancas por plano
lidas do catálogo (migration 0026). O Plus é vendido por UNIDADE (1 unidade = 1
ativável + 10 de agenda). A conta nasce no free (linha real de assinatura no
signup, via trigger `handle_new_user`). No MVP a cobrança em dinheiro é stub trial
(assinar grava 'trial'); o gateway real (faturas) liga depois (H11.7 🟡).

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`
- `provedor.ts`: interface `ProvedorPagamento` + `provedorStub` (`provedorAtivo`)

## Rotas
- `GET  /billing/planos`     catálogo (4 planos + alavancas)
- `GET  /billing/assinatura` (JWT) plano vigente + unidades + preço congelado + alavancas
- `POST /billing/assinar`    (JWT) define o plano (Plus exige `unidades`); grava 'trial'
- `POST /billing/checkout`   (JWT) cria fatura pendente via adaptador do provedor
- `POST /billing/webhook`    evento do provedor: loga, atualiza fatura e ativa a assinatura se 'pago'

## Tabelas
- dono de: assinaturas, pagamentos, eventos_pagamento
- lê de: planos

## Alavancas do plano (catálogo, lidas em runtime)
capacidade de agenda (balde único), vagas de aviso ativo, recorrência, cadência
configurável, menu de texto livre, confirmação `informado_pago`, totais por
período, reengajamento máximo, somente_leitura (free). A resolução das alavancas e
a contagem da agenda vivem em `shared/planos` (funções SQL `alavancas_do_plano` /
`contar_agenda`), não neste módulo (módulo nunca importa módulo).

## Gateway (provedor.ts)
Estrutura agnóstica: o billing fala só com `ProvedorPagamento`. Para ligar um
provedor real (Mercado Pago/Stripe/Asaas), implemente a interface e troque
`provedorAtivo`. Webhook valida `x-webhook-secret` se `BILLING_WEBHOOK_SECRET`
existir (em prod, validar a assinatura do provedor). `pagamentos` tem índice
único `(provedor, provedor_ref)` para idempotência. Vocabulário neutro: "fatura".
