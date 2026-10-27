-- Fluxo de atendimento editavel (builder visual), versionado por loja.
--
--   fluxos          cabecalho do fluxo da loja (nome, ativo). No maximo UM ativo por loja; o motor do
--                   atendente executa a versao publicada do fluxo ativo (sem fluxo ativo, usa o padrao).
--   fluxo_versoes   versoes do grafo (jsonb validado na api contra o catalogo de nodes). Estados:
--                   rascunho -> publicada -> arquivada. So o rascunho e editavel; publicada e
--                   arquivada sao IMUTAVEIS (trigger). Sem DELETE: versoes nunca somem, desativa-se.
-- O grafo e configuracao da loja (textos que ela escolhe), nao dado de consumidor: sem PII.

create table public.fluxos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  ativo boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fluxos_nome_tamanho check (char_length(nome) between 1 and 120),
  -- alvo da FK composta de fluxo_versoes (versao nunca aponta para fluxo de outra loja).
  constraint fluxos_id_loja unique (id, loja_id)
);
-- Um fluxo ativo por loja.
create unique index fluxos_um_ativo_por_loja on public.fluxos (loja_id) where ativo;
create index fluxos_loja on public.fluxos (loja_id, criado_em desc);

create table public.fluxo_versoes (
  id uuid primary key default gen_random_uuid(),
  fluxo_id uuid not null,
  loja_id uuid not null,
  versao integer not null check (versao >= 1),
  status text not null default 'rascunho' check (status in ('rascunho', 'publicada', 'arquivada')),
  grafo jsonb not null,
  schema_versao smallint not null default 1,
  criado_por uuid,
  publicada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fluxo_versoes_fluxo foreign key (fluxo_id, loja_id) references public.fluxos (id, loja_id),
  constraint fluxo_versoes_numero unique (fluxo_id, versao),
  constraint fluxo_versoes_grafo_objeto check (jsonb_typeof(grafo) = 'object'),
  constraint fluxo_versoes_grafo_tamanho check (octet_length(grafo::text) <= 262144),
  constraint fluxo_versoes_publicada_em check ((status = 'rascunho') = (publicada_em is null))
);
-- Um rascunho e uma publicada por fluxo.
create unique index fluxo_versoes_um_rascunho on public.fluxo_versoes (fluxo_id) where status = 'rascunho';
create unique index fluxo_versoes_uma_publicada on public.fluxo_versoes (fluxo_id) where status = 'publicada';
create index fluxo_versoes_loja on public.fluxo_versoes (loja_id, fluxo_id, versao desc);

-- Imutabilidade: fora do rascunho o grafo (e a identidade da versao) nao muda; o unico movimento
-- permitido apos publicar e publicada -> arquivada. Rascunho -> publicada fixa publicada_em.
create function public.fluxo_versoes_imutavel() returns trigger language plpgsql as $$
begin
  if new.id <> old.id or new.fluxo_id <> old.fluxo_id or new.loja_id <> old.loja_id
     or new.versao <> old.versao then
    raise exception 'fluxo_versoes: identidade da versao e imutavel' using errcode = '23514';
  end if;
  if old.status = 'rascunho' then
    if new.status not in ('rascunho', 'publicada') then
      raise exception 'fluxo_versoes: rascunho so vira publicada' using errcode = '23514';
    end if;
    return new;
  end if;
  if new.grafo is distinct from old.grafo or new.schema_versao <> old.schema_versao
     or new.publicada_em is distinct from old.publicada_em then
    raise exception 'fluxo_versoes: versao publicada e imutavel' using errcode = '23514';
  end if;
  if not (old.status = new.status or (old.status = 'publicada' and new.status = 'arquivada')) then
    raise exception 'fluxo_versoes: transicao de estado invalida' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger trg_fluxo_versoes_imutavel before update on public.fluxo_versoes
  for each row execute function public.fluxo_versoes_imutavel();

alter table public.fluxos enable row level security;
alter table public.fluxo_versoes enable row level security;

-- api: edita e publica (SELECT/INSERT/UPDATE; sem DELETE). Atendente (motor): so le a publicada.
grant select, insert, update on public.fluxos to whaviso_api;
grant select, insert, update on public.fluxo_versoes to whaviso_api;
grant select on public.fluxos to whaviso_atendente;
grant select on public.fluxo_versoes to whaviso_atendente;

create policy api_fluxos on public.fluxos
  for all to whaviso_api using (true) with check (true);
create policy api_fluxo_versoes on public.fluxo_versoes
  for all to whaviso_api using (true) with check (true);
create policy atendente_fluxos on public.fluxos
  for select to whaviso_atendente using (true);
create policy atendente_fluxo_versoes on public.fluxo_versoes
  for select to whaviso_atendente using (true);
