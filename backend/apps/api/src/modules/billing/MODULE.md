# billing

## Propósito
Carteira de créditos de envio (Épico 11, modelo pré-pago). 1 envio = 1 ocorrência de
aviso; tudo é liberado para todos, o que limita é o SALDO. Não há mais planos,
assinatura, checkout nem webhook de pagamento: a compra é MANUAL no MVP (o usuário
escolhe a quantidade num slider, fala no WhatsApp e paga via Pix; o OWNER credita
depois, no módulo admin). Este módulo só LÊ: saldo da carteira + curva do catálogo
(para o slider) e o extrato dos lançamentos. NÃO há endpoint de auto-crédito (o
usuário nunca se credita, H11.11).

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Rotas
- `GET /billing/carteira` (JWT) saldo (livre/reservado/em hold/consumido) + curva do catálogo
- `GET /billing/extrato`  (JWT) lançamentos da conta, paginado (compra/crédito/reserva/consumo/devolução/hold)

## Tabelas
- lê de: creditos_carteira, creditos_catalogo, creditos_lancamentos

## Carteira (shared/planos, lido em runtime)
A leitura do saldo, a curva de preço (`precoPorEnvioCentavos`) e a movimentação da
carteira (reserva/consumo/devolução/crédito/hold, sempre com livro-razão) vivem em
`shared/planos`, não neste módulo (módulo nunca importa módulo). A reserva acontece na
ATIVAÇÃO (módulo avisos); o consumo no DISPARO (zap); o crédito do owner no módulo admin.
