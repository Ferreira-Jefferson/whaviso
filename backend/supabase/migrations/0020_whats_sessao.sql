-- Estado da sessão do WhatsApp (Baileys). Tabela de 1 linha (id=1): o zap grava
-- status/QR ao conectar/parear; a api (admin) lê para mostrar "escaneie o QR" e
-- "conectado como X". Resolve o pareamento numa VPS headless sem endpoint extra.
-- (Transporte via Baileys até ~100 clientes; depois migra p/ Meta Cloud API.)

create table public.whats_sessao (
  id smallint primary key default 1,
  status text not null default 'desconectado'
    check (status in ('desconectado', 'aguardando_qr', 'conectado')),
  numero text,
  qr text,
  atualizado_em timestamptz not null default now(),
  constraint whats_sessao_unica check (id = 1)
);

insert into public.whats_sessao (id, status) values (1, 'desconectado')
on conflict (id) do nothing;

-- Grants: o zap escreve (upsert na linha única); a api só lê para o admin.
grant select, insert, update on public.whats_sessao to whaviso_zap;
grant select on public.whats_sessao to whaviso_api;

-- RLS deny-all para anon/authenticated; policies só para os roles de serviço.
alter table public.whats_sessao enable row level security;
create policy zap_whats_sessao on public.whats_sessao for all to whaviso_zap using (true) with check (true);
create policy api_whats_sessao on public.whats_sessao for select to whaviso_api using (true);
