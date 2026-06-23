-- Outbox dos lembretes. Dono lógico: módulo `aceite` (insert) + `enviar_lembretes` do zap (claim/envio).

create table public.envios (
  id uuid primary key default gen_random_uuid(),
  aviso_id uuid not null references public.avisos (id) on delete cascade,
  etapa etapa_envio not null,
  status status_envio not null default 'agendado',
  agendado_para timestamptz not null,
  enviado_em timestamptz,
  tentativas smallint not null default 0,
  proxima_tentativa_em timestamptz,
  wamid text,
  entrega_status entrega_status,
  erro text,
  criado_em timestamptz not null default now(),
  constraint envios_unico_por_etapa unique (aviso_id, etapa)
);

-- Índice do claim do scheduler (apenas linhas que ainda podem ser enviadas).
create index idx_envios_due on public.envios (agendado_para)
  where status in ('agendado', 'processando');

-- Lookup por wamid no processamento de statuses do webhook.
create index idx_envios_wamid on public.envios (wamid) where wamid is not null;

-- Encerramento: ao entrar em estado terminal, cancela todo envio ainda pendente.
-- Garante o "nunca mais envia" (regra de ouro nº6) no nível do banco.
create or replace function public.encerrar_envios_do_aviso()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('pago', 'cancelado', 'expirado') and old.status <> new.status then
    update public.envios
      set status = 'cancelado'
      where aviso_id = new.id and status in ('agendado', 'processando');
  end if;
  return new;
end;
$$;

create trigger trg_avisos_encerrar_envios
  after update of status on public.avisos
  for each row execute function public.encerrar_envios_do_aviso();
