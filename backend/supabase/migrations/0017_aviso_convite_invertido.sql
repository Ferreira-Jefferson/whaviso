-- Convite invertido + aceite por telefone (sem conta).
--
-- Dois fluxos espelhados sobre a mesma maquinaria de convite/aceite:
--   receber  -> criador = cobrador (conta);    convidado = devedor   (convite vai ao devedor).
--   pagar    -> criador = devedor  (conta);    convidado = cobrador  (convite vai ao cobrador).
--
-- Convenção de telefones (independe de quem criou):
--   telefone_devedor   = telefone do DEVEDOR  -> SEMPRE o alvo dos lembretes do ciclo.
--   telefone_cobrador  = telefone do COBRADOR -> alvo do convite no fluxo invertido (novo).
--
-- O convidado aceita pelo botão do WhatsApp (webhook, sem login) OU pela página pública;
-- enquanto não vincula uma conta, fica identificado só pelo telefone (cobrador_id /
-- devedor_profile_id ficam null até o backfill no signup com telefone verificado).

-- 1) cobrador_id passa a ser opcional: no invertido só é preenchido quando o cobrador aceita/vincula.
alter table public.avisos alter column cobrador_id drop not null;

-- 2) Papel RELACIONAL de quem criou o aviso (não confundir com profiles.role, que é
--    só owner/user, ver 0015). Legado (receber e pagar self-reminder) = 'cobrador'.
create type papel_aviso as enum ('cobrador', 'devedor');
alter table public.avisos
  add column criador_papel papel_aviso not null default 'cobrador';

-- 3) Telefone do cobrador (alvo do convite no invertido; opcional no receber).
alter table public.avisos add column telefone_cobrador text;
alter table public.avisos
  add constraint avisos_telefone_cobrador_e164
  check (telefone_cobrador is null or telefone_cobrador ~ '^\+[1-9][0-9]{9,14}$');

-- 3b) Nome do cobrador denormalizado: no invertido o cobrador é convidado e não tem
--     profile (até vincular), então não dá para ler o nome via join em cobrador_id.
--     Espelha o que nome_devedor já faz para o devedor sem conta. Null no receber
--     (lá o nome do cobrador vem de profiles via cobrador_id).
alter table public.avisos add column nome_cobrador text;
alter table public.avisos
  add constraint avisos_nome_cobrador_tam
  check (nome_cobrador is null or char_length(nome_cobrador) between 1 and 120);

-- 4) O convite precisa de um destino conforme a direção.
--    receber: vai ao devedor. pagar invertido (criador devedor): vai ao cobrador.
--    pagar self-reminder legado (criador cobrador): sem convite, sem exigência.
alter table public.avisos drop constraint avisos_receber_tem_telefone;
alter table public.avisos
  add constraint avisos_convite_tem_destino check (
    case
      when direcao = 'receber' then telefone_devedor is not null
      when direcao = 'pagar' and criador_papel = 'devedor' then telefone_cobrador is not null
      else true
    end
  );

-- 5) Índices para o backfill por telefone (ligar avisos órfãos a uma conta no signup).
create index idx_avisos_tel_devedor_sem_perfil
  on public.avisos (telefone_devedor) where devedor_profile_id is null and telefone_devedor is not null;
create index idx_avisos_tel_cobrador_sem_perfil
  on public.avisos (telefone_cobrador) where cobrador_id is null and telefone_cobrador is not null;

-- Nota: a máquina de estados (0011) já permite aguardando_aceite -> {pendente, cancelado, expirado},
-- então aceite (-> pendente) e recusa (-> cancelado) não exigem alteração no trigger.

-- Evento de recusa do convite (convidado recusou o combinado: aguardando_aceite -> cancelado).
alter type tipo_evento add value if not exists 'recusado';
