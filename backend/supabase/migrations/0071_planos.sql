-- Catalogo de planos da plataforma (Whaviso -> restaurante). Admin da equipe cria/edita pela UI.
-- Catalogo comeca VAZIO (sem seed). `inclui` = lista de textos livres do que o plano inclui.
-- assinaturas.plano_id e aditivo e opcional: o valor combinado continua GRAVADO na assinatura
-- (valor_mensal_centavos), entao reajustar o plano nao muda a fatura de quem ja assinou.
-- Sem DELETE: plano muda de estado (ativo), nunca some.

create table public.planos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor_centavos integer not null,
  inclui text[] not null default '{}',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint planos_nome check (length(btrim(nome)) between 1 and 80),
  constraint planos_valor check (valor_centavos >= 0)
);
create unique index planos_nome_unico on public.planos (lower(btrim(nome)));

create trigger trg_planos_atualizado_em before update on public.planos
  for each row execute function public.tocar_atualizado_em();

alter table public.planos enable row level security;
grant select, insert, update on public.planos to whaviso_api;
create policy api_planos on public.planos for all to whaviso_api using (true) with check (true);

alter table public.assinaturas add column plano_id uuid references public.planos (id);
create index assinaturas_plano on public.assinaturas (plano_id) where plano_id is not null;
