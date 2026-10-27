# relatorios

## Proposito
BI de fundo da loja, alem do `dashboard` (painel rapido): relatorios parametrizados por periodo e
dimensao. Read-model: puro SELECT agregado, nenhuma escrita, nenhum dado pessoal. Nao importa nem
duplica o dashboard (copia local de `periodo.ts`: modulo nunca importa modulo).

## Entry points
- `index.ts`: `relatoriosRoutes` (registry, prefixo `relatorios`) e `criarRelatoriosRoutes()`.
- Rotas (`/v1/relatorios`, `conteudo_de_loja`, permissao `relatorios:ver` = dono/gerente, loja = a do
  `x-loja-id`; `de`/`ate` = datas de negocio SP, `ate` inclusivo, default ultimos 30 dias, max 366 dias,
  senao 400 `periodo_invalido`):
  - `GET /vendas?agrupar_por=dia|semana|mes|hora|dia_semana|origem|modalidade|categoria|item[&limite]`
  - `GET /formas-pagamento`
  - `GET /cancelamentos[?limite]`
  - `GET /coortes`

## Definicoes
- Venda = pedido `entregue`; periodo por `pedidos.criado_em` (dia civil SP, intervalo `[inicio, fim)`).
- `categoria`/`item`: linhas nao canceladas de pedidos entregues; categoria via `itens.categoria_id`
  (item sem vinculo cai em "Sem categoria"); `limite` = top N por faturamento.
- Ticket medio = faturamento / pedidos (null em categoria/item). Participacao = fatia 0..1.
- Formas de pagamento: `movimentos_caixa` tipo `venda` (por `criado_em`) + Pix online conciliado
  (`pagamentos.pago`, por `pago_em`) de pedidos sem venda no caixa (sem dupla contagem).
- Cancelamentos: pedidos em `problema` (nao existe status `cancelado`) agrupados pelo motivo
  normalizado (trim + minusculas); taxa = problemas / pedidos nao rascunho.
- Coortes: mes SP do primeiro pedido valido (nem rascunho nem problema) do cliente; retencao = clientes
  distintos ativos em cada mes seguinte (offset 0..12, so ate o mes corrente). So contagens.

## Tabelas (somente leitura, por SQL)
`pedidos`, `itens_pedido`, `itens`, `categorias`, `movimentos_caixa`, `pagamentos`. Sempre `loja_id`.
