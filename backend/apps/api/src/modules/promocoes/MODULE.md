# promocoes

## Proposito
Camada de preco promocional da loja: cupons (percentual/fixo) e combos, com janela de validade,
limites de uso (total e por cliente), pedido minimo e teto de desconto. Fornece o calculo como
funcao pura e a API de validar/aplicar; NAO altera pedidos (quem monta o pedido chama este modulo).

## Entry points
- `index.ts`: `promocoesRoutes` (registry, prefixo `promocoes`), `calcularPromocao` e `aplicarDesconto` (puras).
- Rotas finais (`/v1/promocoes`): `GET|POST /` e `GET|PATCH /:id` (dono/gerente);
  `POST /validar` (200 com `valido`/`motivo`), `POST /aplicar` (422 com `error.code` = motivo) e
  `POST /usos` (registra uso ao confirmar pedido; 201 novo, 200 repetido) para quem tem `pedidos:gerir`.

## Regras
- Desconto incide so no subtotal (taxa de entrega fora), nunca passa do subtotal, arredonda para baixo.
- `valor`: percentual 1..100 | centavos (fixo) | preco final do combo em centavos.
- Codigo guardado em MAIUSCULAS, unico por loja. Sem DELETE: `ativo=false` desliga.
- Motivos 422: cupom_inexistente, cupom_inativo, cupom_nao_iniciado, cupom_expirado, cupom_esgotado,
  cupom_cliente_esgotado, pedido_abaixo_minimo, combo_incompleto.
- Limite por cliente so e aferido quando o pedido tem `cliente_id`.
- Uso idempotente por (promocao, pedido); `POST /usos` trava a linha (FOR UPDATE) contra corrida.
- Tipo, codigo e itens do combo sao imutaveis (para trocar, crie outra promocao).

## Contrato de uso (para API-pedidos, sem importar este modulo)
Ao montar: `POST /v1/promocoes/aplicar` com `subtotal_centavos`, `linhas` (combo) e `cliente_id`;
gravar o desconto no pedido. Ao confirmar: `POST /v1/promocoes/usos`.

## Tabelas
- dono de: `promocoes` (select/insert/update), `promocao_itens` (select/insert), `promocao_usos` (select/insert, ledger).
- le de: `itens`, `clientes`, `pedidos` (so existencia por loja_id).
- escreve: `eventos` (`promocao.criada|atualizada|desativada`, `detalhes` so com `user_id`).
