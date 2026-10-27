-- G9: forma de pagamento + troco no pedido (carimbo para a comanda e para o motoboy).
--
-- O node `pagamento` ja oferece Pix, dinheiro e cartao, mas o pedido nao registrava a forma
-- escolhida nem o troco ("troco para quanto?"). Sem isso o motoboy sai sem troco (erro
-- operacional real). Estas colunas carimbam a escolha no proprio pedido, lida depois pela
-- comanda (impressao) e pelo despacho.
--
-- Vocabulario de forma_pagamento identico ao de public.movimentos_caixa (0028): uma unica
-- lista de formas no produto. Modelado como TEXT + CHECK (nao pg_enum) de proposito: evita
-- um tipo novo no catalogo de enums e acompanha o padrao da 0028.
--
-- troco_para_centavos: valor em dinheiro que o cliente vai entregar, em centavos (dinheiro em
-- centavos, inteiro). So faz sentido quando forma_pagamento = 'dinheiro'; para as demais formas
-- fica NULL. O troco a devolver (troco_para - total) e derivado na leitura, nao persistido.

alter table public.pedidos
  add column forma_pagamento text,
  add column troco_para_centavos integer;

alter table public.pedidos
  add constraint pedidos_forma_pagamento_valida
    check (forma_pagamento is null
           or forma_pagamento in ('dinheiro', 'credito', 'debito', 'pix', 'outro')),
  add constraint pedidos_troco_nao_negativo
    check (troco_para_centavos is null or troco_para_centavos >= 0),
  -- Troco so acompanha pagamento em dinheiro: para as demais formas (ou sem forma) fica NULL.
  add constraint pedidos_troco_so_dinheiro
    check (troco_para_centavos is null or forma_pagamento = 'dinheiro');

-- Sem novos grants: pedidos ja concede select/insert/update a whaviso_api e whaviso_atendente
-- (migration 0005). As novas colunas entram nesses mesmos grants de tabela.
