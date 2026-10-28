-- Regime de pagamento do motoboy: COMO a loja paga o entregador. Fica no cadastro de entrega
-- (tabela motoboys, 1:1 com a pessoa) e e respeitado no calculo do acerto (modulo de contas a pagar).
--   por_entrega      (default): so as entregas valem, cada uma por zonas_entrega.valor_motoboy_centavos.
--                               Preserva exatamente o comportamento de hoje.
--   fixo                      : valor fixo por dia trabalhado (periodicidade='dia') ou por mes ('mes').
--   fixo_mais_entrega         : parcela fixa (conforme periodicidade) + as entregas.
-- A parcela fixa e DERIVADA no calculo do acerto (nao vira lancamento gravado), igual ao total nunca
-- ser armazenado. periodicidade_fixo so importa quando ha parcela fixa; valor em centavos (nunca < 0).
create type regime_pagamento   as enum ('por_entrega', 'fixo', 'fixo_mais_entrega');
create type periodicidade_fixo as enum ('dia', 'mes');

alter table public.motoboys
  add column regime_pagamento    regime_pagamento   not null default 'por_entrega',
  add column periodicidade_fixo  periodicidade_fixo not null default 'dia',
  add column valor_fixo_centavos integer            not null default 0,
  add constraint motoboys_valor_fixo_nao_negativo check (valor_fixo_centavos >= 0);
