-- Console da plataforma: leitura minima de auth.users/auth.identities via funcoes SECURITY DEFINER.
-- O role whaviso_api nao tem grant no schema auth; em vez de abrir a tabela inteira, expomos so
-- duas operacoes estreitas (resolver user_id por e-mail; e-mail + provedores de uma lista de ids).
-- search_path fixo (defesa de SECURITY DEFINER). Idempotente (create or replace).

create or replace function public.plataforma_user_id_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$$;

create or replace function public.plataforma_auth_info(p_user_ids uuid[])
returns table (user_id uuid, email text, provedores text[])
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select u.id, u.email,
         coalesce((select array_agg(distinct i.provider order by i.provider)
                     from auth.identities i where i.user_id = u.id), '{}'::text[])
    from auth.users u
   where u.id = any(p_user_ids)
$$;

revoke all on function public.plataforma_user_id_por_email(text) from public;
revoke all on function public.plataforma_auth_info(uuid[]) from public;
grant execute on function public.plataforma_user_id_por_email(text) to whaviso_api;
grant execute on function public.plataforma_auth_info(uuid[]) to whaviso_api;
