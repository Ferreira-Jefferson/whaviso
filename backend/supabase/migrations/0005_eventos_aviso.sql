-- Trilha de auditoria imutável (consentimento, opt-out, transições). Append-only.

create table public.eventos_aviso (
  id bigint generated always as identity primary key,
  aviso_id uuid not null references public.avisos (id) on delete cascade,
  tipo tipo_evento not null,
  ator ator_evento not null,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

create index idx_eventos_aviso on public.eventos_aviso (aviso_id, criado_em);

-- Imutável contra adulteração: rejeita UPDATE do trilho de auditoria.
-- DELETE não é bloqueado por trigger de propósito: nenhum role de serviço tem GRANT de
-- DELETE (defesa por privilégio) e os avisos também não são deletáveis pelos serviços;
-- a única remoção possível é a CASCATA quando o aviso inteiro é removido (manutenção/superusuário),
-- que deve propagar normalmente; bloqueá-la quebraria o `on delete cascade`.
create or replace function public.rejeitar_update_evento()
returns trigger
language plpgsql
as $$
begin
  raise exception 'eventos_aviso e imutavel (append-only)'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger trg_eventos_imutavel
  before update on public.eventos_aviso
  for each row execute function public.rejeitar_update_evento();
