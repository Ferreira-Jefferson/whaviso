-- Onda 4 P2: limite de frequencia por cliente nas campanhas (anti-spam / anti-fadiga).
--
-- Um cliente que ja recebeu o maximo de mensagens de campanha dentro da janela movel e PULADO no
-- disparo seguinte (registrado como `suprimido_frequencia` em campanha_envios, sem linha na outbox),
-- sem bloquear os demais destinatarios. A contagem e por (loja, cliente): nunca cruza loja.
--
-- Config por loja (padrao sensato): ate 2 mensagens de campanha por cliente a cada 7 dias.
-- campanha_freq_max NULL = sem limite (desliga a regra). Datas em UTC; janela em dias corridos.

alter table public.lojas
  add column campanha_freq_max integer default 2,
  add column campanha_freq_janela_dias integer not null default 7;

alter table public.lojas
  add constraint lojas_campanha_freq_max_positiva
    check (campanha_freq_max is null or campanha_freq_max > 0),
  add constraint lojas_campanha_freq_janela_dias_faixa
    check (campanha_freq_janela_dias > 0 and campanha_freq_janela_dias <= 365);

-- Estado do par (campanha, cliente) pulado pela regra de frequencia (nao e falha).
alter type status_campanha_envio add value if not exists 'suprimido_frequencia';

-- Sem novos grants: whaviso_api ja tem update em public.lojas e insert em campanha_envios.
