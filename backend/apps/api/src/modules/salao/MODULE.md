# salao

## Proposito
Controle de salao (mesas e comandas) para o dono atender presencialmente: cadastra mesas, abre
uma comanda por mesa livre, lanca itens do cardapio (snapshot de nome/preco) recalculando o total
e fecha a comanda. Ao fechar, da baixa de estoque de item e insumo (mesma regra da venda) e lanca
o recebimento no caixa aberto. Nao toca na tabela `pedidos`.

## Entry points
- `index.ts`: `salaoRoutes` (registry) e `criarSalaoRoutes()` (injetavel em teste).
- Rotas finais (`/v1/salao`):
  - `GET /mesas` (lista mesas + comanda aberta), `POST /mesas`, `PATCH /mesas/:id`.
  - `POST /comandas` (abrir `{mesa_id}`), `GET /comandas/:id`,
    `POST /comandas/:id/itens` (lancar `{item_id, quantidade}`),
    `POST /comandas/:id/fechar` (`{forma_pagamento}`: entra no caixa aberto).

## Permissoes
- Operar comandas e ver mesas: `pedidos:gerir` (dono/gerente/atendente) - fluxo de turno.
- Cadastrar/editar mesa (`POST`/`PATCH /mesas`): `loja:gerir` (dono/gerente) - config da loja.

## Tabelas (migration 0029)
- dono de (escrita pelo painel): `mesas`, `comandas`, `comanda_itens`. RLS deny-all; grants
  whaviso_api SELECT/INSERT/UPDATE. **Sem DELETE**: mesa some com `ativo = false`; comanda encerra
  com `status = 'fechada'`; corrigir lancamento = lancar outro (estado/quantidade).
- le de: `itens` (cardapio: snapshot de nome/preco + `controla_estoque`/`quantidade_disponivel`
  para barrar item esgotado no lancamento); `caixas` (caixa aberto da loja, `for update`).
- escreve: `eventos` (`salao.mesa_criada`, `salao.mesa_atualizada`, `salao.comanda_aberta`,
  `salao.item_lancado`, `salao.comanda_fechada`; `detalhes` so com ids e `user_id`);
  `movimentos_caixa` (recebimento da comanda, idempotente por `comanda:<id>`).
- baixa de estoque no fechamento: trigger `trg_comanda_baixa_estoque` (migration 0080) na aresta
  `aberta -> fechada` da comanda (item recusa quando falta saldo; insumo clampa em zero), na mesma
  transacao do fechamento.

## Invariantes
- Preco NUNCA vem do cliente: o servidor le `public.itens` e grava snapshot (`nome_item`,
  `preco_unitario_centavos`). Dinheiro em centavos.
- No maximo UMA comanda aberta por mesa (indice parcial unico `comandas_uma_aberta_por_mesa`);
  abrir numa mesa ocupada -> 409 `mesa_ocupada`.
- Nome de mesa unico entre as ATIVAS da loja (`mesas_nome_ativa`); colisao -> 409 `mesa_nome_em_uso`.
- `total_centavos` da comanda = soma(`quantidade * preco_unitario_centavos`), recalculado a cada
  lancamento dentro da transacao (comanda travada `for update`).
- Item esgotado nao e lancado (historia 07, regra 3): `item_inativo` (desativado) ou `item_esgotado`
  (por `esgotado_ate` no futuro ou contador zerado, historia 03).
- Fechar exige caixa aberto: sem caixa -> 409 `caixa_fechado`. Fechar + baixar estoque + lancar no
  caixa e atomico (uma transacao); fechar de novo e no-op (status `fechada` ja barra).
- Multi-tenant: toda consulta filtra por `loja_id` do escopo; loja ativa so de header/rota (SEC-002).

## Contratos
- Zod em `@whaviso/shared/contracts` (`salao.ts`), reexportado por `schemas.ts`; `:id` fica local.
