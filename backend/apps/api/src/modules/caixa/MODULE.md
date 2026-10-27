# caixa

## Proposito
Caixa (PDV) operado fisicamente no balcao: abrir/fechar sessao de caixa, registrar vendas
presenciais e suas formas de pagamento, sangria/suprimento e conferencia de fechamento. Um
sistema so: o dono opera o caixa enquanto o atendente de WhatsApp roda em paralelo. Dinheiro em
centavos; multi-tenant por `loja_id`.

## Entry points
- `index.ts`: `caixaRoutes` (registry) e `criarCaixaRoutes()`.
- Rotas finais (`/v1/caixa`, todas `conteudo_de_loja` + permissao `pedidos:gerir`):
  `POST /abrir` (`{ saldo_inicial_centavos }`) -> 201 sessao,
  `GET /aberto` -> sessao aberta ou `{ caixa: null }`,
  `POST /:id/movimentos` (`{ tipo, forma_pagamento?, valor_centavos, pedido_id?, motivo? }`) -> 201 movimento,
  `POST /:id/fechar` (`{ saldo_informado_centavos, observacoes? }`) -> sessao fechada com calculo,
  `GET /:id/relatorio` -> totais por forma + saldo esperado + movimentos.

## Especialistas consumidos
- `@whaviso/shared/db` (sql, comTransacao, ErroBanco), `@whaviso/shared/contracts`,
  `shared/http_errors`, `shared/tenant` (`escopoLoja`, `exigirPermissao`).

## Tabelas
- dono de escrita: `caixas` (abre/fecha: SELECT/INSERT/UPDATE) e `movimentos_caixa`
  (append-only: SELECT/INSERT, sem UPDATE/DELETE: lancamento nunca some nem se reescreve).
- escreve ainda `eventos` (`caixa.aberto`, `caixa.movimento`, `caixa.fechado`; `detalhes` sem PII:
  user_id, ids, tipo, valores em centavos).
- le `pedidos` (existencia por loja) para vincular a venda a um pedido.

## Regras
- **Uma sessao aberta por loja:** garantido pelo indice parcial unico `caixas (loja_id) where
  status='aberto'`; a api pre-checa e traduz a corrida para 409 `caixa_ja_aberto`.
- **Movimento:** `venda` exige `forma_pagamento` (dinheiro/credito/debito/pix/outro) e `valor > 0`
  e pode vincular `pedido_id` (da loja). `sangria`/`suprimento` sao dinheiro do caixa (sem forma),
  `valor > 0`. `ajuste` exige `motivo`, aceita valor negativo e NAO entra na conta do dinheiro
  esperado (anotacao de conferencia). Forma em movimento que nao e venda = 422 `forma_nao_aplicavel`.
  So se lanca em caixa `aberto` (senao 409 `caixa_fechado`).
- **Fechamento:** `saldo_calculado = saldo_inicial + suprimentos + vendas_em_dinheiro - sangrias`;
  `diferenca = saldo_informado - saldo_calculado` (pode ser negativa). UPDATE condicionado a
  `status='aberto'` (barra duplo fechamento). Sessao fechada e imutavel.
- **Relatorio:** totais por forma de pagamento (vendas), total de vendas/suprimentos/sangrias/ajustes,
  dinheiro esperado na gaveta, contagem e lista de movimentos da sessao.

## Contratos (espelhar no front)
`@whaviso/shared/contracts` (`caixa.ts`): `CaixaAbrirEntrada`, `MovimentoEntrada`, `CaixaFecharEntrada`,
`CaixaSaida`, `SessaoAbertaSaida`, `MovimentoSaida`, `CaixaRelatorioSaida`.

## Fora de escopo
Conciliacao com `pagamentos`/Pix, relatorio consolidado multi-sessao/periodo, folha e fiscal.
