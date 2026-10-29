# fidelidade

## Proposito
Fidelidade/cashback do consumidor final (retencao). A loja configura um programa (pontos ou
cashback); o cliente acumula saldo ao ter um pedido entregue e resgata em pedido futuro. O saldo
e derivado de um livro append-only por cliente. Tudo escopado por loja.

## Entry points
- `index.ts`: `fidelidadeRoutes` (registry, prefixo `fidelidade`).
- Rotas finais (`/v1/fidelidade`): `GET|PUT /programa`, `GET /clientes/:clienteId/saldo`,
  `GET /clientes/:clienteId/movimentos` (cursor), `POST /acumular`, `POST /resgatar`.

## Especialistas consumidos
- `@whaviso/shared/db`, `shared/http_errors`, `shared/tenant` (escopo e permissao via `app.escopoLoja`).

## Tabelas
- dono de: `fidelidade_programas` (uma por loja; select/insert/update, sem delete) e
  `fidelidade_movimentos` (append-only: select/insert; UPDATE barrado por trigger).
- le de: `pedidos` (status, cliente_id, subtotal, codigo), `clientes` (so existencia; nunca telefone).
- escreve: `eventos` (`fidelidade.programa_atualizado|acumulo|resgate`, sem PII).

## Contratos
- Zod em `@whaviso/shared/contracts` (`contracts/fidelidade.ts`, espelhar no front).

## Regras
- Unidade do `valor`: cashback = centavos, pontos = pontos. Cashback: `floor(base * cashback_bps / 10000)`.
  Pontos: `floor(base * pontos_por_real / 100)`; resgate vale `valor_ponto_centavos` por ponto.
- Base do acumulo = subtotal do pedido (sem entrega) menos o desconto de resgate do mesmo pedido.
- Acumulo: pedido `entregue` com cliente, uma vez por pedido (`acumulo_ja_registrado`).
- Resgate: pedido em andamento com cliente, uma vez por pedido, respeita minimo e teto
  (`max_resgate_bps` do subtotal); sem saldo = 422 `saldo_insuficiente`.
- O resgate NAO altera o pedido: devolve `desconto_centavos` para o fluxo de pedidos aplicar.
- Modo travado (`modo_travado`) depois do primeiro movimento da loja (a unidade do saldo mudaria).
- Concorrencia: `pg_advisory_xact_lock` por cliente serializa saldo_apos. O teto de resgate e
  reconferido dentro da transacao com o subtotal lido `FOR UPDATE` (serializa contra o recalculo
  de totais do pedido), para nao gravar desconto acima do teto se as linhas cairem em paralelo.
- Configurar: `loja:gerir`. Saldo, extrato, acumular e resgatar: `pedidos:gerir`.
