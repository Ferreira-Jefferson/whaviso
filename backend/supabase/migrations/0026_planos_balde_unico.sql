-- Épico 11 (Planos, limites e billing): catálogo de 4 planos com a AGENDA como
-- BALDE ÚNICO + alavancas por plano lidas em runtime (nunca fixadas no código).
--
-- O que muda em relação ao catálogo antigo (0019, pessoal/profissional/
-- personalizado por fórmula):
--   * 4 planos com chaves estáveis: free, start, profissional, plus.
--   * cada plano declara suas ALAVANCAS em colunas (capacidade de agenda, vagas
--     de aviso ativo, recorrência, cadência configurável, menu de texto livre,
--     confirmação informado_pago, totais por período, reengajamento máximo).
--   * o Plus deixa de ter preço por fórmula e passa a ser vendido por UNIDADE
--     (1 unidade = 1 combinado ativável + 10 anotações de agenda).
--   * a conta nasce no FREE (linha real de assinatura no signup; sem default
--     implícito espalhado pelo código).
--
-- Regras de ouro: dinheiro em centavos; sem DELETE de negócio (os planos antigos
-- viram catálogo aposentado, NÃO são apagados, pois há FK em assinaturas/
-- pagamentos; as assinaturas existentes são MIGRADAS de plano, sem perder o preço
-- congelado); catálogo em migration upsert idempotente (chega ao cloud via
-- `supabase db push`, o seed não roda lá).
--
-- NOTA DE ESCOPO (coordenação com E4/F-STATE): o estado `sem_aviso` (modo agenda)
-- ainda NÃO existe; ele é criado depois. Por isso, NESTE estágio, a contagem de
-- "balde único" (contar_agenda) conta os avisos NÃO-arquivados do criador (que
-- hoje só nascem já no ciclo). Quando E4 ligar `sem_aviso`, a contagem já estará
-- correta por construção (anotações sem_aviso também são linhas em `avisos` do
-- criador e entram no balde). Não criamos `sem_aviso` aqui.

-- 1. Alavancas por plano (colunas no catálogo). Defaults conservadores; os
--    valores reais entram no upsert abaixo.
alter table public.planos add column if not exists capacidade_agenda integer;
alter table public.planos add column if not exists vagas_ativas integer; -- null = "= capacidade_agenda" (não infinito real)
alter table public.planos add column if not exists cadencia_configuravel boolean not null default false;
alter table public.planos add column if not exists menu_texto_livre boolean not null default false;
alter table public.planos add column if not exists informado_pago_habilitado boolean not null default false;
alter table public.planos add column if not exists totais_periodo boolean not null default false;
-- Plus é vendido por unidade: cada unidade contratada = `ativaveis_por_unidade`
-- vagas ativas + `agenda_por_unidade` anotações de agenda.
alter table public.planos add column if not exists por_unidade boolean not null default false;
alter table public.planos add column if not exists agenda_por_unidade integer not null default 10;
alter table public.planos add column if not exists ativaveis_por_unidade integer not null default 1;
-- Reengajamento manual pós-ciclo (H11.5): teto de envios por combinado. DONO: este
-- épico (alavanca de catálogo); a MECÂNICA (nunca 2 no mesmo dia, etc.) é do E8,
-- que LÊ este teto. 0 = recurso indisponível no plano.
alter table public.planos add column if not exists reengajamento_max integer not null default 0;
-- Free é somente leitura: mantém agenda e visualiza, mas NÃO ativa envio. A api
-- usa esta flag como guarda própria ANTES do limite numérico (nunca cai em
-- "limite atingido com 0 vagas").
alter table public.planos add column if not exists somente_leitura boolean not null default false;

-- 2. Upsert idempotente dos 4 planos (fonte única; chega ao cloud via db push).
--    Preços em centavos:
--      free          R$ 0,00
--      start         R$ 9,90  (era o "pessoal")
--      profissional  R$ 29,00 (decisão: base 29 do "29/49"; nome mantido)
--      plus          preço POR UNIDADE (preco_centavos = preço de 1 unidade)
--    Capacidade de agenda (balde único): free 50, start 100, profissional 150,
--    plus 10 por unidade. Vagas de aviso ativo: free 0 (somente leitura), start
--    e profissional null (= capacidade da agenda, nunca trava ativar enquanto
--    couber), plus = 1 por unidade.
insert into public.planos
  (id, nome, preco_centavos, max_avisos_ativos, permite_recorrente, parametrico,
   capacidade_agenda, vagas_ativas, cadencia_configuravel, menu_texto_livre,
   informado_pago_habilitado, totais_periodo, por_unidade, agenda_por_unidade,
   ativaveis_por_unidade, reengajamento_max, somente_leitura)
values
  ('free',         'Whaviso Free',          0, 0,    false, false,
     50, 0, false, false, false, false, false, 10, 0, 0, true),
  ('start',        'Whaviso Start',       990, null, false, false,
     100, null, false, true, true, false, false, 10, 0, 3, false),
  ('profissional', 'Whaviso Profissional', 2900, null, true, false,
     150, null, true, true, true, true, false, 10, 0, 3, false),
  ('plus',         'Whaviso Plus',        2900, null, true, false,
     10, null, true, true, true, true, true, 10, 1, 3, false)
on conflict (id) do update set
  nome = excluded.nome,
  preco_centavos = excluded.preco_centavos,
  max_avisos_ativos = excluded.max_avisos_ativos,
  permite_recorrente = excluded.permite_recorrente,
  parametrico = excluded.parametrico,
  capacidade_agenda = excluded.capacidade_agenda,
  vagas_ativas = excluded.vagas_ativas,
  cadencia_configuravel = excluded.cadencia_configuravel,
  menu_texto_livre = excluded.menu_texto_livre,
  informado_pago_habilitado = excluded.informado_pago_habilitado,
  totais_periodo = excluded.totais_periodo,
  por_unidade = excluded.por_unidade,
  agenda_por_unidade = excluded.agenda_por_unidade,
  ativaveis_por_unidade = excluded.ativaveis_por_unidade,
  reengajamento_max = excluded.reengajamento_max,
  somente_leitura = excluded.somente_leitura;

-- 3. assinaturas: nova coluna `unidades` (substitui `quantidade` no modelo Plus
--    por unidade; 1 unidade = 1 ativável + 10 de agenda). C2: a constraint antiga
--    `assinaturas_quantidade_minima (>= 16)` BLOQUEIA o Plus (que pode ter 1
--    unidade), então é DROPADA e recriada como `unidades >= 1`.
alter table public.assinaturas add column if not exists unidades integer;
alter table public.assinaturas drop constraint if exists assinaturas_quantidade_minima;
alter table public.assinaturas drop constraint if exists assinaturas_unidades_minima;
alter table public.assinaturas
  add constraint assinaturas_unidades_minima check (unidades is null or unidades >= 1);

-- 4. MIGRAÇÃO de assinaturas existentes para o novo catálogo (sem DELETE, sem
--    perder o preço congelado). Mapeamento:
--      pessoal        -> start  (preço congelado preservado quando existir)
--      profissional   -> profissional (chave estável mantida; nada a fazer)
--      personalizado  -> plus   (quantidade contratada vira `unidades`; cada
--                                ativável = 1 unidade)
update public.assinaturas
   set plano_id = 'start'
 where plano_id = 'pessoal';

update public.assinaturas
   set plano_id = 'plus',
       unidades = greatest(coalesce(quantidade, 1), 1)
 where plano_id = 'personalizado';

-- 5. Backfill: toda conta referencia UM plano vigente. Quem ainda não tem linha
--    de assinatura passa a ter uma de `free` (estratégia única decidida: linha
--    real, não default implícito). Status 'trial' (sem pagamento no MVP).
insert into public.assinaturas (profile_id, plano_id, status)
select p.id, 'free', 'trial'
  from public.profiles p
 where not exists (select 1 from public.assinaturas a where a.profile_id = p.id)
on conflict (profile_id) do nothing;

-- 6. Conta NASCE no free (H11.7 / Épico 1). O trigger handle_new_user cria o
--    profile no signup; estendemos para criar também a assinatura free. Mantém o
--    security definer (roda como dono) e a idempotência.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''))
  on conflict (id) do nothing;
  -- Conta nasce no plano free (somente leitura: agenda + visualização, sem envio).
  insert into public.assinaturas (profile_id, plano_id, status)
  values (new.id, 'free', 'trial')
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

-- 7. Arquivamento de anotação da agenda (H11.4): "excluir da agenda" é SOFT, nunca
--    DELETE físico (regra de não-DELETE de negócio). Sai da contagem/visão da
--    agenda quando preenchido. Só o usuário arquiva (guarda na api). Criado ANTES das
--    funções de contagem, que dependem dele.
alter table public.avisos add column if not exists arquivado_em timestamptz;

-- 8. Função SQL: ALAVANCAS DO PLANO VIGENTE de uma conta, já resolvendo o Plus
--    por unidade e o default free. Fonte única para a api ler os limites do
--    catálogo (H11.1, H11.8). `vagas_ativas` resolvido: null vira a própria
--    capacidade de agenda (no Start/Profissional ativar nunca trava enquanto
--    couber na agenda); no Plus é ativaveis_por_unidade * unidades.
create or replace function public.alavancas_do_plano(uid uuid)
returns table (
  plano_id text,
  capacidade_agenda integer,
  vagas_ativas integer,
  somente_leitura boolean,
  permite_recorrente boolean,
  cadencia_configuravel boolean,
  menu_texto_livre boolean,
  informado_pago_habilitado boolean,
  totais_periodo boolean,
  reengajamento_max integer,
  unidades integer
)
language sql
stable
as $$
  with assi as (
    -- Default free quando não há linha (defesa em profundidade; o signup já cria
    -- a linha free, mas o helper nunca depende disso).
    select coalesce(
             (select a.plano_id from public.assinaturas a where a.profile_id = uid),
             'free'
           ) as plano_id,
           (select a.unidades from public.assinaturas a where a.profile_id = uid) as unidades
  )
  select
    p.id,
    case when p.por_unidade
         then p.agenda_por_unidade * greatest(coalesce(assi.unidades, 1), 1)
         else p.capacidade_agenda end as capacidade_agenda,
    case
      when p.por_unidade
        then p.ativaveis_por_unidade * greatest(coalesce(assi.unidades, 1), 1)
      when p.vagas_ativas is not null
        then p.vagas_ativas
      -- null = vagas de ativo seguem a capacidade da agenda (teto único).
      else p.capacidade_agenda
    end as vagas_ativas,
    p.somente_leitura,
    p.permite_recorrente,
    p.cadencia_configuravel,
    p.menu_texto_livre,
    p.informado_pago_habilitado,
    p.totais_periodo,
    p.reengajamento_max,
    assi.unidades
  from assi
  join public.planos p on p.id = assi.plano_id;
$$;

-- 9. Função SQL: CONTAGEM DA AGENDA (balde único) de uma conta. C1: NÃO existe
--    coluna `criador_id`; o dono se resolve pela DUPLA condição por papel, idêntica
--    a contarAtivos/avisosDoUsuario (conta certo no fluxo invertido devedor-criador).
--    Balde único: conta TODA anotação do criador, inclusive terminais e (no futuro)
--    pausados; exclui só as arquivadas (arquivado_em not null).
create or replace function public.contar_agenda(uid uuid)
returns integer
language sql
stable
as $$
  select count(*)::int
    from public.avisos
   where arquivado_em is null
     and ((criador_papel = 'cobrador' and cobrador_id = uid)
          or (criador_papel = 'devedor' and devedor_profile_id = uid));
$$;

-- 10. Índices para a contagem de agenda ser barata. C1: índices por papel sobre o
--     dono real, parciais por `arquivado_em is null` (só o que entra no balde).
create index if not exists idx_avisos_agenda_cobrador
  on public.avisos (cobrador_id)
  where arquivado_em is null and criador_papel = 'cobrador';
create index if not exists idx_avisos_agenda_devedor
  on public.avisos (devedor_profile_id)
  where arquivado_em is null and criador_papel = 'devedor';

-- 11. Grant: a api executa as funções (são SQL, herdam permissões do chamador;
--     EXECUTE explícito por clareza). Sem grant para anon/authenticated.
grant execute on function public.alavancas_do_plano(uuid) to whaviso_api;
grant execute on function public.contar_agenda(uuid) to whaviso_api;
