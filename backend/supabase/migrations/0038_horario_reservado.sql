-- E6 (Ciclo de lembretes), H6.9: HORÁRIO RESERVADO de disparo por combinado.
--
-- Cada combinado ganha, no ACEITE, um SEGUNDO próprio dentro da janela comercial
-- 08:00:00..17:59:59 (America/Sao_Paulo) = 28800..64799 segundos desde a meia-noite SP.
-- Todas as etapas (D-2, D-1, D, D+1) disparam NESSE mesmo segundo, cada uma na sua data
-- (timestamp = data da etapa + horário reservado). Espalhar segundo a segundo reduz o
-- risco de bloqueio do WhatsApp (não dispara tudo no mesmo instante).
--
-- D-HORARIO (plano mestre): a UNICIDADE GLOBAL de segundo entre combinados ativos é
-- garantida na LÓGICA de alocação (shared/datas/horario_reservado.ts), NÃO por índice
-- único no banco. Um índice único quebraria o REUSO exigido na reabertura
-- (`pago -> programado`, E8 H8.6), que aceita reusar o mesmo segundo MESMO ocupado.
-- Por isso aqui só criamos colunas + um índice NÃO-único de apoio à busca.
--
-- Numeração: última migration = 0037 (convite_aceite_whatsapp); esta é 0038.
-- Esta migration só ADICIONA colunas/índices e reescreve uma FUNÇÃO de trigger; não usa
-- valores de enum novos em DML, então é segura em auto-commit por statement.

-- ---------------------------------------------------------------------------------------
-- 1) Colunas do horário reservado.
--    horario_reservado_seg  = segundo do dia (SP) em que o combinado dispara; NULL = liberado
--                             (estado terminal). Faixa da janela comercial.
--    horario_reservado_orig = campo RECUPERÁVEL: guarda o último segundo alocado mesmo
--                             quando `_seg` vira NULL, para a reabertura (E8 H8.6) reusar.
--    horario_espacamento_ideal = false quando NÃO coube a distância mínima de 10min/devedor
--                             e o segundo foi escolhido por fallback (G8: observabilidade,
--                             dado não-sensível por aviso_id).
-- ---------------------------------------------------------------------------------------
alter table public.avisos add column if not exists horario_reservado_seg integer
  constraint avisos_horario_reservado_seg_janela
    check (horario_reservado_seg is null or horario_reservado_seg between 28800 and 64799);

alter table public.avisos add column if not exists horario_reservado_orig integer
  constraint avisos_horario_reservado_orig_janela
    check (horario_reservado_orig is null or horario_reservado_orig between 28800 and 64799);

alter table public.avisos add column if not exists horario_espacamento_ideal boolean not null default true;

comment on column public.avisos.horario_reservado_seg is
  'E6/H6.9: segundo do dia (SP, 28800..64799) em que o combinado dispara; NULL quando liberado (terminal). Unicidade global garantida na lógica de alocação, não por índice.';
comment on column public.avisos.horario_reservado_orig is
  'E6/H6.9: último segundo alocado, preservado quando _seg vira NULL, para a reabertura (E8) reusar o mesmo horário.';
comment on column public.avisos.horario_espacamento_ideal is
  'E6/H6.9/G8: false quando a distância mínima de 10min por devedor não coube e o segundo foi escolhido por fallback aleatório.';

-- Índice de apoio à busca de segundo livre e à regra dos 10min por devedor (NÃO único:
-- a unicidade é da lógica de alocação, ver D-HORARIO). Cobre o lookup por telefone_devedor.
create index if not exists idx_avisos_horario_devedor
  on public.avisos (telefone_devedor, horario_reservado_seg)
  where horario_reservado_seg is not null;

-- ---------------------------------------------------------------------------------------
-- 2) Grants: o zap aloca o horário no ACEITE (webhook); a api aloca/reusa nas
--    reativações (pausa, edição) e na reabertura. A liberação no terminal/suspensão é
--    feita pelo TRIGGER (roda como dono da tabela, dispensa grant). Acrescenta as três
--    colunas à lista de UPDATE do zap (a api já tem update amplo, 0008).
-- ---------------------------------------------------------------------------------------
grant update (horario_reservado_seg, horario_reservado_orig, horario_espacamento_ideal)
  on public.avisos to whaviso_zap;

-- ---------------------------------------------------------------------------------------
-- 3) Liberação/suspensão do horário no MESMO trigger que encerra os envios (F-STATE/0028).
--    H6.4/H6.9/G3 (plano mestre gap 8):
--      - TERMINAL (`pago`, `cancelado`, `recusado`, `expirado`): libera o segundo
--        (`_seg = NULL`), PRESERVANDO `_orig` (a reabertura `pago->programado` reusa).
--      - SUSPENSÃO (`pausado`, `aguardando_aprovacao_aviso_editado`, `desregistrado`):
--        NÃO libera o segundo (mantém `_seg` e `_orig`), para a retomada não perder o
--        horário. Os envios suspensos são marcados (erro='suspenso') para distingui-los
--        no painel (E9, G5) e para a reativação saber quais re-armar.
--    Cobre transições disparadas tanto pela api (marcar pago/cancelar/pausar) quanto pelo
--    zap (opt-out/recusa). O trigger roda em `after update of status` (criado em 0004).
-- ---------------------------------------------------------------------------------------
create or replace function public.encerrar_envios_do_aviso()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  -- Estados que cancelam os envios pendentes (terminal: definitivo; suspensão: enquanto durar).
  if new.status in ('pago', 'cancelado', 'recusado', 'expirado') then
    -- TERMINAL: cancela definitivo e libera o segundo (preserva _orig p/ reabertura).
    update public.envios
      set status = 'cancelado', erro = coalesce(erro, 'aviso_' || new.status)
      where aviso_id = new.id and status in ('agendado', 'processando');
    update public.avisos
      set horario_reservado_orig = coalesce(horario_reservado_orig, horario_reservado_seg),
          horario_reservado_seg = null
      where id = new.id;

  elsif new.status in ('pausado', 'aguardando_aprovacao_aviso_editado', 'desregistrado') then
    -- SUSPENSÃO: cancela os envios pendentes (marcador 'suspenso' para distinguir do
    -- terminal no painel e para a reativação re-armar), MAS mantém o segundo reservado.
    update public.envios
      set status = 'cancelado', erro = 'suspenso'
      where aviso_id = new.id and status in ('agendado', 'processando');
  end if;

  return new;
end;
$$;
