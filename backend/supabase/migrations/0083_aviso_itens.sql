-- Fase A (estudo revendedores): composicao OPCIONAL do pedido (itens), para o dono anotar o
-- QUE foi vendido (produto, quantidade, preco unitario), nao so o motivo + valor. Uma venda de
-- venda direta quase sempre tem varios produtos; anotar isso e o lado "caderno de pedidos".
-- Dado INTERNO do dono: NUNCA vai para mensagem ao devedor (nenhum template le esta coluna).
-- Opcional: quem preferir segue usando so o motivo + valor. jsonb com um array de
-- { descricao, qtd, valor_unit_centavos }. O front SOMA os itens no valor como conveniencia,
-- sem constraint de igualdade: o valor combinado segue sendo a fonte da verdade do acordo (o
-- dono pode dar desconto/arredondar). Centavos em todo dinheiro, como no resto do schema.
alter table public.avisos add column itens jsonb;
alter table public.avisos
  add constraint avisos_itens_e_array
  check (itens is null or jsonb_typeof(itens) = 'array');

-- A view combinado_linhas (lista por periodo) NAO precisa dos itens: eles so aparecem no
-- DETALHE do combinado (lido de public.avisos), nao na lista. Por isso nao recriamos a view.
