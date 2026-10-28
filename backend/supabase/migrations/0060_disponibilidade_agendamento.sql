-- Disponibilidade com fonte unica na loja (regras-negocio/05): a antiga "janela do atendente" vira
-- a "janela de agendamento" da loja (modo desligado|faixa|24h). O atendente nao tem horario proprio:
-- opera na disponibilidade da loja e deriva o modo (atendimento|agendamento|fechado). A coluna `ativo`
-- sai (o `modo` e o interruptor). horarios_funcionamento e excecoes_disponibilidade ficam iguais.
-- O campo legado loja.horarios NAO e dropado aqui (fica para um bloco seguinte); aqui so paramos de
-- usa-lo como gate do atendente.

create type modo_agendamento as enum ('desligado', 'faixa', '24h');

alter table public.janela_atendente rename to agendamento_config;

alter table public.agendamento_config add column modo modo_agendamento not null default 'desligado';
update public.agendamento_config set modo = case when ativo then 'faixa'::modo_agendamento else 'desligado'::modo_agendamento end;

alter table public.agendamento_config
  alter column inicio drop not null,
  alter column fim drop not null,
  alter column dias drop not null,
  drop constraint janela_inicio_fim_distintos,
  drop constraint janela_dias_validos,
  drop column ativo,
  add constraint agendamento_faixa_completa check (
    modo <> 'faixa' or (
      inicio is not null and fim is not null and inicio <> fim
      and dias is not null and array_length(dias, 1) between 1 and 7
      and dias <@ array[0,1,2,3,4,5,6]::smallint[]
    )
  );

alter trigger trg_janela_atendente_atualizado_em on public.agendamento_config rename to trg_agendamento_atualizado_em;

comment on table public.agendamento_config is 'Janela de agendamento da loja (modo desligado|faixa|24h). O atendente opera na disponibilidade da loja; nao ha horario proprio do atendente.';
