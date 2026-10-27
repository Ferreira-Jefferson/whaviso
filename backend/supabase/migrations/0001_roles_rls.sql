-- Fundação do banco: extensões, roles de serviço de privilégio mínimo, REVOKE de
-- anon/authenticated cedo e funções genéricas de trigger.
--
-- Princípios (ver docs/pivot/ARQUITETURA.md e BANCO.md):
--   * A api é a única porta de dados. O front nunca fala com o banco; o supabase-js serve só
--     para login. Por isso anon/authenticated não recebem NADA no schema public.
--   * Três roles de serviço, cada um com o teto mínimo de privilégio (GRANT é o teto real;
--     as policies de RLS são "using (true)" só para os roles de serviço):
--       whaviso_api       painel (REST) e console da plataforma
--       whaviso_zap       transporte WhatsApp (webhook entra, outbox sai)
--       whaviso_atendente worker de conversa (IA): lê cardápio/clientes/zonas/base, escreve
--                         mensagens, rascunho de pedido e enfileira em envios
--   * SQL portável: só as extensões pgcrypto e vector; nada específico de Supabase no caminho
--     de dados (auth.users é referenciada apenas como identidade de login).

-- 1. Extensões. pgcrypto: hash/cifra. vector: base de conhecimento (RAG), só quando o servidor
--    oferece a extensão (a migration 0011 se adapta à sua ausência).
create extension if not exists pgcrypto;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'vector') then
    create extension if not exists vector;
  else
    raise notice 'extensao vector indisponivel neste servidor: base_conhecimento e cache_semantico nascem sem a coluna embedding';
  end if;
end
$$;

-- 2. Roles de serviço (idempotente; senhas definidas no seed de dev e no painel em produção).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'whaviso_api') then
    create role whaviso_api login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'whaviso_zap') then
    create role whaviso_zap login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'whaviso_atendente') then
    create role whaviso_atendente login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

do $$
begin
  execute format(
    'grant connect on database %I to whaviso_api, whaviso_zap, whaviso_atendente',
    current_database());
end
$$;

grant usage on schema public to whaviso_api, whaviso_zap, whaviso_atendente;

-- 3. Defesa em profundidade contra a anon key (pública no bundle do front): tira o teto de
--    privilégio de anon/authenticated e impede que objetos FUTUROS nasçam com esse grant.
--    O outro lado é o RLS ligado em TODA tabela (scripts/check_rls_coverage.sh, rodado no CI).
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- 4. Carimbo genérico de atualização, reusado pelas tabelas com atualizado_em.
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- 5. Função genérica de append-only: rejeita UPDATE em trilhas de auditoria e lançamentos.
--    DELETE nunca é concedido a nenhum role de serviço (defesa por privilégio).
create or replace function public.rejeitar_update_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% e imutavel (append-only)', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;
