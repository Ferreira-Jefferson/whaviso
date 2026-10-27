-- G7: pausar a loja agora + capacidade por janela.
--
-- "Pausar pedidos agora" (cozinha afogada): um interruptor que para de aceitar pedido novo sem
-- mexer em horario de funcionamento. Diferente de `lojas.ativo` (liga/desliga a loja no painel)
-- e de `suspensa` (inadimplencia na cobranca, migration 0035): pausada e operacional e temporaria.
--
-- Capacidade por janela: teto de N pedidos aceitos numa faixa movel de M minutos (pico). NULL em
-- capacidade_por_janela = sem limite (comportamento atual preservado).
--
-- A guarda que recusa aceitar pedido novo com a loja pausada ou acima da capacidade vive na
-- costura de criacao/aceite do pedido (modulo pedidos). Estas colunas sao o estado que ela le.

alter table public.lojas
  add column pausada boolean not null default false,
  add column pausada_motivo text,
  add column pausada_ate timestamptz,                 -- pausa que expira sozinha; NULL = ate despausar
  add column capacidade_por_janela integer,           -- NULL = sem limite
  add column capacidade_janela_minutos integer not null default 30;

alter table public.lojas
  add constraint lojas_pausada_motivo_tamanho
    check (pausada_motivo is null or char_length(pausada_motivo) <= 200),
  add constraint lojas_capacidade_por_janela_positiva
    check (capacidade_por_janela is null or capacidade_por_janela > 0),
  add constraint lojas_capacidade_janela_minutos_positiva
    check (capacidade_janela_minutos > 0 and capacidade_janela_minutos <= 1440);

-- Sem novos grants: whaviso_api ja tem update em public.lojas (migration 0002); o painel pausa,
-- despausa e configura capacidade por essas mesmas permissoes.
