# billing

## Propósito
Carteira de créditos de envio (Épico 11, modelo pré-pago). 1 envio = 1 ocorrência de
aviso; tudo é liberado para todos, o que limita é o SALDO. Não há mais planos,
assinatura, checkout nem webhook de pagamento: a compra é MANUAL no MVP (o usuário
escolhe a quantidade num slider, confirma, e o servidor EMPURRA as instruções de
pagamento ao WhatsApp dele; o usuário paga via Pix e manda o comprovante na conversa; o
OWNER credita depois, no módulo admin). Este módulo LÊ (saldo + curva + extrato) e
ENFILEIRA a recarga (não credita: o usuário nunca se credita, H11.11).

## Entry points
- `index.ts`: plugin Fastify registrado em `src/routes.ts` sob `/v1`

## Rotas
- `GET  /billing/carteira` (JWT) saldo (livre/reservado/em hold/consumido) + curva do catálogo
- `GET  /billing/extrato`  (JWT) lançamentos da conta, paginado (compra/crédito/reserva/consumo/devolução/hold)
- `POST /billing/recarga`  (JWT) valida a quantidade, calcula o valor e ENFILEIRA a mensagem de
  compra (template `billing.recarga` + chave Pix da plataforma) na outbox de billing; o `zap`
  envia ao WhatsApp do próprio usuário (H11.10). Recusa: `telefone_ausente`, `pix_nao_configurado`,
  `quantidade_invalida`. NÃO retorna a chave Pix (H13.8). NÃO credita saldo. Retorna `telefone_vendas`
  (número pareado pelo zap, lido de `whats_sessao`) para o front montar o link "abrir conversa" sem env.

## Tabelas
- lê de: creditos_carteira, creditos_catalogo, creditos_lancamentos, config_plataforma, whats_sessao
- escreve em: notificacoes_billing (enfileira a recarga; o zap drena/envia)

## Especialistas consumidos (shared/, módulo nunca importa módulo)
- `shared/planos` (lerCarteira/lerCatalogo/precoPorEnvioCentavos)
- `shared/config_plataforma` (lerConfigPlataforma/temChavePix: a chave Pix da plataforma)
- `shared/notificacoes_billing` (enfileirarRecarga: insere na outbox de billing)
- `shared/whats_sessao` (lerNumeroVendas: número pareado pelo zap, para o link "abrir conversa")

## Carteira (shared/planos, lido em runtime)
A leitura do saldo, a curva de preço (`precoPorEnvioCentavos`) e a movimentação da
carteira (reserva/consumo/devolução/crédito/hold, sempre com livro-razão) vivem em
`shared/planos`, não neste módulo (módulo nunca importa módulo). A reserva acontece na
ATIVAÇÃO (módulo avisos); o consumo no DISPARO (zap); o crédito do owner no módulo admin.
