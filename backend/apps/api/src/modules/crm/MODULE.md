# crm

## Proposito
CRM do restaurante sobre o consumidor final: RFM por cliente, segmentos, o que a loja vende, ficha
(historico, itens favoritos) e registro de opt-out de marketing (primeira classe, base de campanhas).

## Entry points
- `index.ts`: `crmRoutes`. Rotas finais (`/v1/crm`): `GET /clientes` (segmento, contactavel, cursor),
  `GET /clientes/:id`, `GET /resumo`, `GET /itens?dias&limite`, `PUT /clientes/:id/consentimento`.

## Tabelas
- dono de: `cliente_consentimento` (migration 0034; SELECT/INSERT/UPDATE, sem DELETE; estado por flag).
- le de: view `clientes_metricas` (RFM, security_invoker), `pedidos`, `itens_pedido`, `clientes`
  (so por SQL; nunca importa os modulos). Nunca le telefone.
- escreve: `eventos` (`cliente.consentimento_alterado`, `detalhes` so com user_id e o flag).

## Regras RFM (fonte: a view; ver cabecalho da migration)
- Compra = pedido `entregue` (data entregue_em, senao criado_em). Janela de F e M: 180 dias.
- Recencia em dias corridos de America/Sao_Paulo. Notas 1 a 5 por faixas fixas.
- Segmentos: sem_pedido, campeao (R>=4,F>=4), fiel (R>=3,F>=3), em_risco (R<=2,F>=3),
  novo (1 pedido, R>=3), perdido (R=1), ocasional (demais).

## Permissoes
- Leituras: `relatorios:ver` (dono/gerente). Opt-out: `pedidos:gerir` (inclui atendente).

## Opt-out
Ausencia de linha = pode receber. `contactavel=true` na lista exclui quem tem opt-out. Campanhas
(API-campanhas) devem filtrar por `cliente_consentimento.opt_out_marketing` ou por esta view.
