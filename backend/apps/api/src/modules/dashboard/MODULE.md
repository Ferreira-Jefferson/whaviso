# dashboard

## Proposito
Read-model de metricas da loja para o painel: pedidos e faturamento do periodo, status/origem/
modalidade, series por dia e por hora, itens mais vendidos, tempo medio de entrega e saude do
atendimento. Puro SELECT agregado no banco; nenhuma escrita, nenhum dado pessoal.

## Entry points
- `index.ts`: `dashboardRoutes` (registry, prefixo `dashboard`) e `criarDashboardRoutes()`.
- Rotas finais (`/v1/dashboard`, todas `conteudo_de_loja` + permissao `pedidos:gerir`, loja = a do
  `x-loja-id`; query `de`/`ate` = datas de negocio `YYYY-MM-DD`, `ate` inclusivo, default = ultimos 30
  dias ate hoje em SP, maximo 366 dias, senao 400 `periodo_invalido`):
  `GET /resumo`, `GET /serie-diaria`, `GET /por-hora`, `GET /top-itens` (`limite` 1..20, default 10),
  `GET /atendimento`.

## Especialistas consumidos
- `@whaviso/shared/db`, `@whaviso/shared/datas` (fuso e instantes de SP), contratos de
  `shared/contracts/dashboard`, `shared/http_errors`, `shared/tenant` (`escopoLoja`,
  `exigirPermissao`, `escopoPermite`).

## Tabelas (somente leitura, leitura cruzada por SQL; nunca importa o codigo dos modulos)
- `pedidos`, `itens_pedido`, `conversas`. Toda consulta filtra por `loja_id` da loja ativa.

## Definicoes (fonte unica em `metricas.ts`, `repo.ts`)
- Periodo e por `pedidos.criado_em`; dia civil de `America/Sao_Paulo` (banco em UTC), intervalo
  semiaberto `[inicio, fim)`. `rascunho` nunca conta.
- Faturamento realizado = soma de `total_centavos` de `entregue`; em andamento = `novo|em_preparo|
  saiu_entrega`; `problema` so aparece como contagem. Ticket medio = realizado / entregues (null se 0).
- Tempo medio = media de `entregue_em - criado_em` (min, 1 casa) dos entregues.
- Top itens: agrupa `nome_snapshot`; exclui pedidos `rascunho`/`problema` e linhas `cancelado`.
- Autonomia da IA (v1, foto atual): pedidos do periodo com conversa cuja conversa nao tem
  `humano_desde` / pedidos do periodo com conversa. Migra para eventos de handoff sem mudar o contrato.
- Papel: quem nao tem `relatorios:ver` (atendente) recebe so contagens; faturamento, ticket e receita
  vem `null`.

## Fora de escopo
Consolidado multi-loja, custo de LLM, cache, realtime (o front invalida pela query).
