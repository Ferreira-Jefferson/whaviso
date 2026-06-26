-- Épico 11 reescrito (2026-06-26): de 4 planos com alavancas para CARTEIRA DE
-- CRÉDITOS DE ENVIO. O whaviso é pré-pago: a unidade é o ENVIO (1 ocorrência de
-- aviso). Tudo é liberado para todos; o que limita é o SALDO. Compra por
-- quantidade (slider) com curva de preço; saldo aditivo e que NÃO expira.
-- Charge-on-success: reserva na ativação, consome no disparo, devolve o não
-- aceito; opt-out/cancelamento põe o não disparado em hold de 24h e devolve.
--
-- SEM CLIENTE EM PRODUÇÃO: o modelo antigo (planos/assinaturas/versionamento) é
-- removido do zero, sem migração de dados. Ver historias/11-planos-billing.md.

-- 1. Remove a maquinaria de planos. CASCADE limpa FKs, policies e índices
--    dependentes; a função SQL alavancas_do_plano sai antes (dependia de planos).
drop function if exists public.alavancas_do_plano(uuid);
drop table if exists public.eventos_pagamento cascade;
drop table if exists public.pagamentos cascade;
drop table if exists public.assinaturas cascade;
drop table if exists public.plano_versoes cascade;
drop table if exists public.planos cascade;

-- 1b. notificacao_pode_enviar (0041) lia `somente_leitura` de alavancas_do_plano (agora
--     removida). E11 H11.2: notificar o CRIADOR (cobrador) é UNIVERSAL (não é lembrete ao
--     devedor, não consome crédito): toda conta pode enviar. Reescreve para sempre true,
--     preservando a interface (o zap segue chamando notificacao_pode_enviar).
create or replace function public.notificacao_pode_enviar(uid uuid)
returns boolean
language sql
immutable
as $$
  select true;
$$;

-- 2. Catálogo de créditos (1 linha): curva de preço + cortesia + tetos de agenda.
--    Editável pelo owner em runtime (mudança comercial não exige migration).
--    Curva: o total é interpolado entre (envios_min -> preco_centavos) e
--    (envios_max -> preco_max_centavos); o R$/envio cai conforme o volume sobe.
create table public.creditos_catalogo (
  id smallint primary key default 1,
  envios_min integer not null,
  envios_max integer not null,
  preco_centavos integer not null,      -- total na quantidade mínima
  preco_max_centavos integer not null,  -- total na quantidade máxima
  cortesia_inicial integer not null,    -- saldo grátis ao nascer (Free)
  agenda_teto_free integer not null,    -- teto de agenda sem nenhuma compra
  agenda_teto_pago integer not null,    -- teto de agenda após a 1a compra
  atualizado_em timestamptz not null default now(),
  constraint creditos_catalogo_unico check (id = 1),
  constraint creditos_catalogo_faixa check (envios_min >= 1 and envios_max >= envios_min),
  constraint creditos_catalogo_preco check (preco_centavos >= 0 and preco_max_centavos >= preco_centavos),
  constraint creditos_catalogo_agenda check (agenda_teto_free >= 0 and agenda_teto_pago >= agenda_teto_free),
  constraint creditos_catalogo_cortesia check (cortesia_inicial >= 0)
);

-- Valores iniciais (aprovados 2026-06-26; o owner ajusta pela tela de admin):
--   compra de 10 a 500 envios; total R$ 9,90 (10) a R$ 350,00 (500);
--   cortesia do Free = 5 envios; agenda 25 (sem compra) / 1000 (após 1a compra).
insert into public.creditos_catalogo
  (id, envios_min, envios_max, preco_centavos, preco_max_centavos,
   cortesia_inicial, agenda_teto_free, agenda_teto_pago)
values (1, 10, 500, 990, 35000, 5, 25, 1000)
on conflict (id) do nothing;

create trigger trg_creditos_catalogo_atualizado_em
  before update on public.creditos_catalogo
  for each row execute function public.tocar_atualizado_em();

-- 3. Carteira por conta: saldo de TRABALHO (travado na ativação contra corrida).
--    Quatro baldes; `ja_comprou` decide o teto de agenda (regra de 2 estados).
create table public.creditos_carteira (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  saldo_livre integer not null default 0,
  reservado integer not null default 0,
  em_hold integer not null default 0,
  consumido integer not null default 0,
  ja_comprou boolean not null default false,
  atualizado_em timestamptz not null default now(),
  constraint creditos_carteira_nao_negativo
    check (saldo_livre >= 0 and reservado >= 0 and em_hold >= 0 and consumido >= 0)
);

create trigger trg_creditos_carteira_atualizado_em
  before update on public.creditos_carteira
  for each row execute function public.tocar_atualizado_em();

-- 4. Livro-razão (append-only): cada movimento de crédito, auditável. A carteira
--    (item 3) é o saldo de trabalho; o livro-razão é a verdade auditável. Sem
--    UPDATE/DELETE (regra de não-DELETE; estornar é um lançamento novo).
create table public.creditos_lancamentos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tipo text not null,           -- cortesia|compra|credito_owner|reserva|consumo|devolucao|hold|estorno
  quantidade integer not null,  -- sempre positivo; o `tipo` define o sentido
  ref_tipo text,                -- aviso|ocorrencia|pagamento|null
  ref_id uuid,
  ator text,                    -- sistema|owner|usuario
  ator_id uuid,
  criado_em timestamptz not null default now(),
  constraint creditos_lancamentos_tipo_valido
    check (tipo in ('cortesia','compra','credito_owner','reserva','consumo','devolucao','hold','estorno')),
  constraint creditos_lancamentos_qtd_positiva check (quantidade > 0)
);
create index idx_creditos_lancamentos_conta
  on public.creditos_lancamentos (profile_id, criado_em desc);

-- 5. Holds pendentes (worklist do job de devolução de 24h). Cada hold guarda
--    quantos envios voltam, quando vencem e a referência (aviso) para poder
--    CANCELAR a devolução se a pessoa reativar dentro da janela.
create table public.creditos_hold (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  aviso_id uuid references public.avisos (id) on delete cascade,
  quantidade integer not null,
  vence_em timestamptz not null,   -- criado_em + 24h
  resolvido_em timestamptz,        -- preenchido quando devolvido OU reativado
  resolucao text,                  -- 'devolvido' | 'reativado'
  criado_em timestamptz not null default now(),
  constraint creditos_hold_qtd_positiva check (quantidade > 0),
  constraint creditos_hold_resolucao check (resolucao is null or resolucao in ('devolvido','reativado'))
);
-- Índice do job: holds vencidos ainda não resolvidos.
create index idx_creditos_hold_due on public.creditos_hold (vence_em) where resolvido_em is null;

-- 6. Backfill: toda conta existente ganha carteira com o saldo de cortesia + o lançamento
--    de cortesia no livro-razão (H11.1: toda mudança de saldo é um lançamento).
insert into public.creditos_carteira (profile_id, saldo_livre)
select p.id, (select cortesia_inicial from public.creditos_catalogo where id = 1)
  from public.profiles p
on conflict (profile_id) do nothing;

insert into public.creditos_lancamentos (profile_id, tipo, quantidade, ator)
select p.id, 'cortesia', cat.cortesia_inicial, 'sistema'
  from public.profiles p
  cross join public.creditos_catalogo cat
 where cat.id = 1 and cat.cortesia_inicial > 0;

-- 7. Conta NASCE com carteira + cortesia (substitui a criação da assinatura free
--    no signup). Mantém security definer e idempotência; preserva a criação do
--    profile (Épico 1).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cortesia integer := coalesce((select cortesia_inicial from public.creditos_catalogo where id = 1), 0);
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''))
  on conflict (id) do nothing;
  -- Carteira + saldo de cortesia (modelo de créditos, Épico 11). O lançamento de
  -- cortesia no livro-razão só entra quando a carteira é CRIADA agora (idempotência: se
  -- a carteira já existia, não duplica o lançamento).
  insert into public.creditos_carteira (profile_id, saldo_livre)
  values (new.id, v_cortesia)
  on conflict (profile_id) do nothing;
  if found and v_cortesia > 0 then
    insert into public.creditos_lancamentos (profile_id, tipo, quantidade, ator)
    values (new.id, 'cortesia', v_cortesia, 'sistema');
  end if;
  return new;
end;
$$;

-- 8. Teto de agenda da conta (regra de 2 estados, H11.7): Free modesto até a 1a
--    compra; generoso depois. contar_agenda (0026) continua valendo (balde único).
create or replace function public.agenda_teto_da_conta(uid uuid)
returns integer
language sql
stable
as $$
  select case
           when coalesce((select c.ja_comprou from public.creditos_carteira c where c.profile_id = uid), false)
             then cat.agenda_teto_pago
             else cat.agenda_teto_free
         end
    from public.creditos_catalogo cat
   where cat.id = 1;
$$;

-- 9. Grants (padrão da 0008: sem DELETE; livro-razão também sem UPDATE).
--    api: dona da carteira (reserva, crédito do owner) e do catálogo (owner edita).
grant select, insert, update on public.creditos_carteira to whaviso_api;
grant select, insert on public.creditos_lancamentos to whaviso_api;
grant select, insert, update on public.creditos_hold to whaviso_api;
grant select, update on public.creditos_catalogo to whaviso_api;
--    zap: consome no disparo e roda o job de hold (atualiza carteira/hold, lança).
grant select, update on public.creditos_carteira to whaviso_zap;
grant select, insert on public.creditos_lancamentos to whaviso_zap;
grant select, insert, update on public.creditos_hold to whaviso_zap;
grant select on public.creditos_catalogo to whaviso_zap;

grant execute on function public.agenda_teto_da_conta(uuid) to whaviso_api;

-- 10. RLS deny-all para anon/authenticated; policies só para os roles de serviço.
alter table public.creditos_catalogo    enable row level security;
alter table public.creditos_carteira    enable row level security;
alter table public.creditos_lancamentos enable row level security;
alter table public.creditos_hold        enable row level security;

create policy api_creditos_catalogo on public.creditos_catalogo for all to whaviso_api using (true) with check (true);
create policy zap_creditos_catalogo on public.creditos_catalogo for select to whaviso_zap using (true);
create policy api_creditos_carteira on public.creditos_carteira for all to whaviso_api using (true) with check (true);
create policy zap_creditos_carteira on public.creditos_carteira for all to whaviso_zap using (true) with check (true);
create policy api_creditos_lancamentos on public.creditos_lancamentos for all to whaviso_api using (true) with check (true);
create policy zap_creditos_lancamentos on public.creditos_lancamentos for all to whaviso_zap using (true) with check (true);
create policy api_creditos_hold on public.creditos_hold for all to whaviso_api using (true) with check (true);
create policy zap_creditos_hold on public.creditos_hold for all to whaviso_zap using (true) with check (true);
