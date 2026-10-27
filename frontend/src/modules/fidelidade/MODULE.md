# fidelidade (frontend)

## Proposito
Configurar o programa de fidelidade da loja (ligado/desligado, modo pontos ou cashback e parametros)
e consultar saldo e extrato por cliente. Rota `/fidelidade`.

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/fidelidade'))`).

## Dados
- `GET|PUT /v1/fidelidade/programa`, `GET /v1/fidelidade/clientes/:id/saldo`,
  `GET /v1/fidelidade/clientes/:id/movimentos` (cursor); busca de cliente em `GET /v1/clientes?q=`
  (contrato `clientes`; telefone sempre mascarado, nunca revelado).
- Contratos: `@/shared/contracts/_generated/fidelidade` e `clientes`. Cache: raiz `['fidelidade']`.

## Regras
- Dinheiro em centavos (`MoneyInput`/`brl`); percentuais em pontos-base (`PercentInput`: 5,00% = 500).
- `valor` do movimento esta na unidade do programa: centavos no cashback, pontos no modo pontos.
- Modo trava depois do primeiro movimento: o backend responde `modo_travado` e a tela explica; o
  seletor nao e bloqueado preventivamente porque a API nao expoe esse estado (ver lacunas).
- `POST /acumular` e `/resgatar` nao sao usados: pertencem ao fluxo de pedidos. Esta tela e leitura + configuracao.
- O exemplo "pedido de R$ 50,00 gera ..." so ilustra a formula documentada; o valor real e do backend.
- Configurar exige `loja:gerir`; saldo e extrato exigem `pedidos:gerir`.

## Lacunas de API
- `ProgramaSaida` nao informa `modo_travado`; hoje o usuario so descobre ao salvar.
- Nao ha listagem de clientes com saldo (so saldo por cliente), por isso a busca previa de cliente.

## Primitivos locais
- `Alternador` (copia do padrao do cardapio), `PercentInput`.
