# estoque_insumos

## Proposito
Estoque de materia-prima do restaurante (arroz, feijao, carne, oleo...), POR LOJA. Distinto do
estoque por item do cardapio: aqui e o insumo bruto que a ficha tecnica (migration 0027) consome
por venda. Cadastro (CRUD sem delete), saldo atual com minimo de alerta, trilha de movimentos
append-only e lista de itens abaixo do minimo.

## Entry points
- `index.ts`: `estoqueInsumosRoutes` (registry) e `criarEstoqueRoutes()` (injetavel em teste);
  `consumirInsumo` (funcao pura para o fluxo da ficha tecnica, ver abaixo).
- Rotas finais (`/v1/estoque-insumos`): `GET /` (lista; `?incluir_inativos=true`),
  `GET /baixo-estoque`, `POST /`, `GET|PATCH /:id`, `GET /:id/movimentos`, `POST /movimentos`.
- Permissao: `loja:gerir` (dono/gerente). Insumo e configuracao/operacao da loja, como cardapio e zonas.

## Tabelas (dono: escrita pelo painel)
- `insumos`: cadastro + `quantidade_atual` (saldo) + `quantidade_minima` (alerta) + `custo_unitario_centavos`.
  Sem DELETE: desativa com `ativo = false`. `quantidade_atual` SO muda por movimento (nunca via PATCH).
- `movimentos_insumo`: append-only (sem UPDATE/DELETE; trigger `rejeitar_update_append_only`). Uma linha
  por mudanca de saldo, com `quantidade_resultante` (saldo apos o movimento). Tipos: `entrada`, `saida`,
  `ajuste`, `consumo`.
- escreve: `eventos` (`insumo.criado`, `insumo.atualizado`, `insumo.movimentado`; `detalhes` so com `user_id`).

## Semantica do movimento
- `entrada`: saldo += quantidade. `saida`: saldo -= quantidade (NUNCA negativo; 422 `estoque_insuficiente`).
- `ajuste`: saldo = quantidade (recontagem para um valor absoluto). `consumo`: saldo -= quantidade (ficha tecnica).
- Movimento e mudanca de saldo sao atomicos (uma transacao). Saldo e numeric(14,3); comparacoes no SQL.

## Contrato para a ficha tecnica / atendente (migration 0027) - NAO importa este modulo
O consumo por venda roda no role `whaviso_atendente` (grants: SELECT + UPDATE(quantidade_atual) em
`insumos`, INSERT em `movimentos_insumo`). Use a funcao pura ou o SQL equivalente, dentro de UMA transacao:

- Funcao: `consumirInsumo(exec, { insumo_id, loja_id, quantidade, pedido_id?, user_id? })` ->
  `{ aplicado: true, quantidade_resultante, movimento_id } | { aplicado: false, motivo }`.
  Nunca deixa o saldo negativo (se faltar, `aplicado: false`, `motivo: 'estoque_insuficiente'`); nao lanca.
- SQL equivalente (guarda numeric-exata):
  `update public.insumos set quantidade_atual = quantidade_atual - $q where id=$1 and loja_id=$2 and quantidade_atual - $q >= 0 returning quantidade_atual` (0 linhas = sem saldo), seguido de
  `insert into public.movimentos_insumo (loja_id, insumo_id, tipo, quantidade, quantidade_resultante, pedido_id, criado_por_user_id) values (..., 'consumo', ...)`.

## Contratos
- Zod em `@whaviso/shared/contracts/estoque_insumos.ts` (fonte unica; espelhado no front). Unidades
  fechadas em `UNIDADES_INSUMO`. `schemas.ts` reexporta + `IdParams`.

## Especialistas consumidos
- `@whaviso/shared/db` (sql parametrizado + `comTransacao`), `shared/http_errors`, `shared/tenant`
  (`app.escopoLoja`, `app.exigirPermissao`).
