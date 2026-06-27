-- Funções SECURITY DEFINER para consultar auth.identities sem conceder acesso
-- direto ao schema auth. Usadas pela api para:
--   1. /auth/status-telefone: distinguir conta Google de conta phone antes do OTP.
--   2. PATCH /perfil: só fazer backfill de avisos quando o telefone foi verificado via OTP.

create or replace function public.auth_provider_do_telefone(p_telefone text)
returns text
language sql
security definer
stable
set search_path = public, auth
as $$
  -- 'phone' se o dono do telefone tem identidade phone (pode entrar por OTP).
  -- 'google' se só tem google (deve entrar pelo Google).
  -- null se nenhum profile tem esse telefone.
  select
    case
      when exists(
        select 1 from auth.identities i
        join public.profiles p on p.id = i.user_id
        where p.telefone = p_telefone and i.provider = 'phone'
      ) then 'phone'
      when exists(
        select 1 from auth.identities i
        join public.profiles p on p.id = i.user_id
        where p.telefone = p_telefone
      ) then 'google'
      else null
    end;
$$;

grant execute on function public.auth_provider_do_telefone(text) to whaviso_api;

-- ----

create or replace function public.usuario_tem_identidade_phone(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists(
    select 1 from auth.identities
    where user_id = p_user_id and provider = 'phone'
  );
$$;

grant execute on function public.usuario_tem_identidade_phone(uuid) to whaviso_api;
