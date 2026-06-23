-- role_usuario: (owner, cobrador, devedor) -> (owner, user).
-- Motivo: cobrador/devedor NÃO são identidade do usuário, são papel RELACIONAL
-- dentro de um aviso (avisos.cobrador_id vs avisos.devedor_profile_id + direcao).
-- A mesma pessoa é cobrador num aviso e devedor noutro. A role só distingue
-- admin do sistema (owner) de cliente (user).
--
-- NÃO confundir com o enum SEPARADO `ator_evento` (cobrador/devedor/sistema/admin),
-- que descreve quem agiu num evento: esse permanece intacto.
-- `role_usuario` só é usado por public.profiles.role.
--
-- Postgres não dropa valor de enum: recria-se o tipo. owner é preservado;
-- todo o resto (cobrador/devedor) consolida em user.

alter table public.profiles alter column role drop default;

create type role_usuario_v2 as enum ('owner', 'user');

alter table public.profiles
  alter column role type role_usuario_v2
  using (case role::text when 'owner' then 'owner' else 'user' end::role_usuario_v2);

drop type role_usuario;
alter type role_usuario_v2 rename to role_usuario;

alter table public.profiles alter column role set default 'user';
