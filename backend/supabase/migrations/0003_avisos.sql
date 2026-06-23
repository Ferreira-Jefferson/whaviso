-- Avisos (combinados financeiros). Dono: módulo `avisos` da api; `aceite`/`acoes_devedor`/`recebimentos` transicionam status.

create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  cobrador_id uuid not null references public.profiles (id) on delete cascade,
  devedor_profile_id uuid references public.profiles (id) on delete set null,
  direcao direcao_aviso not null,
  status status_aviso not null default 'aguardando_aceite',
  nome_devedor text not null,
  telefone_devedor text,
  motivo text not null,
  valor_centavos bigint not null,
  data_combinada date not null,
  pix_chave text,
  -- Só o hash sha256 dos tokens (gerados em claro na api). Nunca o token em si.
  aceite_token_hash text unique,
  aceite_token_expira_em timestamptz,
  acao_token_hash text unique,
  aceito_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint avisos_valor_positivo check (valor_centavos > 0),
  constraint avisos_motivo_tam check (char_length(motivo) between 3 and 120),
  constraint avisos_nome_tam check (char_length(nome_devedor) between 1 and 120),
  constraint avisos_telefone_e164 check (telefone_devedor is null or telefone_devedor ~ '^\+[1-9][0-9]{9,14}$'),
  constraint avisos_pix_tam check (pix_chave is null or char_length(pix_chave) <= 140),
  -- direcao=receber exige telefone (vai para o WhatsApp); pagar é registro de painel.
  constraint avisos_receber_tem_telefone check (direcao <> 'receber' or telefone_devedor is not null)
);

create index idx_avisos_cobrador_status on public.avisos (cobrador_id, status);
create index idx_avisos_devedor on public.avisos (devedor_profile_id) where devedor_profile_id is not null;
create index idx_avisos_data on public.avisos (data_combinada);

create trigger trg_avisos_atualizado_em
  before update on public.avisos
  for each row execute function public.tocar_atualizado_em();

-- Máquina de estados no banco (defesa em profundidade; a api também valida p/ erros amigáveis).
create or replace function public.validar_transicao_aviso()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'aguardando_aceite' and new.status in ('pendente', 'cancelado', 'expirado')) or
    (old.status = 'pendente' and new.status in ('pago', 'cancelado', 'expirado')) or
    (old.status = 'pago' and new.status = 'pendente') -- desmarcar recebimento
  ) then
    raise exception 'transicao de status invalida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger trg_avisos_transicao
  before update of status on public.avisos
  for each row execute function public.validar_transicao_aviso();
