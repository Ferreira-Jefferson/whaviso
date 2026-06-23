-- Segurança: roles de serviço de privilégio mínimo + RLS deny-all para anon/authenticated.
-- Defesa em profundidade: mesmo que um JWT vaze, PostgREST não expõe dado nenhum.

-- 1. Roles de serviço (idempotente; senhas definidas no seed dev / dashboard prod).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'whaviso_api') then
    create role whaviso_api login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'whaviso_zap') then
    create role whaviso_zap login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

grant connect on database postgres to whaviso_api, whaviso_zap;
grant usage on schema public to whaviso_api, whaviso_zap;

-- 2. GRANTs de tabela (o teto do que cada serviço pode fazer; sem DELETE em nada).
-- api: dono dos dados do SPA.
grant select, insert, update on
  public.profiles, public.avisos, public.envios, public.templates_mensagem, public.assinaturas
  to whaviso_api;
grant select, insert on public.eventos_aviso to whaviso_api;
grant select on public.planos to whaviso_api;

-- zap: lê o que precisa para enviar; só transiciona status/entrega.
grant select on public.avisos, public.profiles, public.templates_mensagem to whaviso_zap;
grant update (status, aceito_em, atualizado_em) on public.avisos to whaviso_zap;
grant select, update on public.envios to whaviso_zap;
grant select, insert on public.eventos_aviso to whaviso_zap;

-- eventos_aviso é append-only: ninguém recebe UPDATE/DELETE (reforçado pelo trigger da 0005).

-- 3. RLS habilitado em tudo. Sem policy para anon/authenticated => PostgREST nega tudo.
alter table public.profiles            enable row level security;
alter table public.avisos              enable row level security;
alter table public.envios              enable row level security;
alter table public.eventos_aviso       enable row level security;
alter table public.templates_mensagem  enable row level security;
alter table public.planos              enable row level security;
alter table public.assinaturas         enable row level security;

-- 4. Policies SOMENTE para os roles de serviço. O escopo por usuário é feito na api
--    (WHERE cobrador_id = $userId etc.), não na policy: os roles operam sobre todas as linhas.
create policy api_profiles on public.profiles for all to whaviso_api using (true) with check (true);
create policy api_avisos on public.avisos for all to whaviso_api using (true) with check (true);
create policy api_envios on public.envios for all to whaviso_api using (true) with check (true);
create policy api_templates on public.templates_mensagem for all to whaviso_api using (true) with check (true);
create policy api_assinaturas on public.assinaturas for all to whaviso_api using (true) with check (true);
create policy api_eventos on public.eventos_aviso for all to whaviso_api using (true) with check (true);
create policy api_planos on public.planos for select to whaviso_api using (true);

create policy zap_avisos on public.avisos for all to whaviso_zap using (true) with check (true);
create policy zap_profiles on public.profiles for select to whaviso_zap using (true);
create policy zap_templates on public.templates_mensagem for select to whaviso_zap using (true);
create policy zap_envios on public.envios for all to whaviso_zap using (true) with check (true);
create policy zap_eventos on public.eventos_aviso for all to whaviso_zap using (true) with check (true);
