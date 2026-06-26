-- 0054: Catálogo de planos VERSIONADO + congelamento por assinatura (E11 H11.11/H11.12).
--
-- Produção com clientes pagantes: editar o catálogo NÃO pode alterar quem já paga. Hoje
-- só o preço é congelado (assinaturas.preco_centavos); os limites/recursos vêm ao vivo de
-- `alavancas_do_plano` (join public.planos). Esta migration congela TUDO por assinatura.
--
-- Modelo (baixo risco): `public.planos` continua sendo a OFERTA CORRENTE (mesmas colunas,
-- GET /billing/planos e landing inalterados). A história de versões vive em
-- `public.plano_versoes` (append-only); cada assinatura PAGA fixa a versão contratada
-- (`assinaturas.plano_versao_id`). `alavancas_do_plano` passa a resolver pela versão
-- fixada (fallback à corrente quando pin null/free, ou período vencido). Editar o catálogo
-- (admin) cria uma nova versão e avança `planos.versao_corrente_id`; assinaturas vigentes
-- não mudam. No vencimento (`vigente_ate`), a resolução cai na versão corrente (o cliente
-- entra no plano novo na renovação); o DISPARO automático depende do billing real (🟡).
-- O FREE não fixa versão (pin null) e acompanha a corrente (não paga, não vence).
--
-- Numeração: última = 0053; esta é 0054. Depende da 0051 (grant/policy de UPDATE em planos,
-- usado pela edição do owner). Aplicar as duas juntas no cloud (supabase db push).

-- 1. Tabela de VERSÕES do catálogo (append-only). Espelha as colunas de alavanca/preço
--    de public.planos no momento em que a versão foi criada.
create table public.plano_versoes (
  id uuid primary key default gen_random_uuid(),
  plano_id text not null references public.planos (id),
  versao integer not null,
  nome text not null,
  preco_centavos integer not null,
  max_avisos_ativos integer,
  permite_recorrente boolean not null,
  capacidade_agenda integer,
  vagas_ativas integer,
  cadencia_configuravel boolean not null,
  menu_texto_livre boolean not null,
  informado_pago_habilitado boolean not null,
  totais_periodo boolean not null,
  por_unidade boolean not null,
  agenda_por_unidade integer not null,
  ativaveis_por_unidade integer not null,
  reengajamento_max integer not null,
  edicoes_max integer not null,
  somente_leitura boolean not null,
  por_envio boolean not null,
  envios_min integer,
  envios_max integer,
  preco_max_centavos integer,
  criado_em timestamptz not null default now(),
  constraint plano_versoes_plano_versao_unica unique (plano_id, versao),
  constraint plano_versoes_preco_nao_negativo check (preco_centavos >= 0)
);

-- 2. Ponteiro da versão CORRENTE em planos (a que vale para novas contratações).
alter table public.planos add column if not exists versao_corrente_id uuid references public.plano_versoes (id);

-- 3. Seed: versão 1 de cada plano = estado atual do catálogo. Idempotente.
insert into public.plano_versoes (
  plano_id, versao, nome, preco_centavos, max_avisos_ativos, permite_recorrente,
  capacidade_agenda, vagas_ativas, cadencia_configuravel, menu_texto_livre,
  informado_pago_habilitado, totais_periodo, por_unidade, agenda_por_unidade,
  ativaveis_por_unidade, reengajamento_max, edicoes_max, somente_leitura,
  por_envio, envios_min, envios_max, preco_max_centavos
)
select
  id, 1, nome, preco_centavos, max_avisos_ativos, permite_recorrente,
  capacidade_agenda, vagas_ativas, cadencia_configuravel, menu_texto_livre,
  informado_pago_habilitado, totais_periodo, por_unidade, agenda_por_unidade,
  ativaveis_por_unidade, reengajamento_max, edicoes_max, somente_leitura,
  por_envio, envios_min, envios_max, preco_max_centavos
from public.planos
on conflict (plano_id, versao) do nothing;

update public.planos p
   set versao_corrente_id = v.id
  from public.plano_versoes v
 where v.plano_id = p.id and v.versao = 1
   and p.versao_corrente_id is null;

-- 4. Assinaturas: pin da versão contratada + fim do período contratado.
alter table public.assinaturas add column if not exists plano_versao_id uuid references public.plano_versoes (id);
alter table public.assinaturas add column if not exists vigente_ate timestamptz;

-- 5. Backfill (produção): clientes PAGOS pinam a versão corrente (mantêm exatamente o que
--    têm hoje); FREE fica com pin null (acompanha a corrente, H11.12). vigente_ate null
--    (sem expiração até o billing real definir o período).
update public.assinaturas a
   set plano_versao_id = p.versao_corrente_id
  from public.planos p
 where p.id = a.plano_id
   and a.plano_id <> 'free'
   and a.plano_versao_id is null;

-- 6. Reescreve alavancas_do_plano: resolve pela VERSÃO FIXADA da assinatura. Fallback à
--    versão corrente do plano quando o pin é null (free / conta sem assinatura) OU o
--    período venceu (vigente_ate < now). DROP+CREATE: mesma assinatura de retorno do 0033.
drop function if exists public.alavancas_do_plano(uuid);
create function public.alavancas_do_plano(uid uuid)
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
  edicoes_max integer,
  unidades integer
)
language sql
stable
as $$
  with assi as (
    -- Conta COM assinatura: resolve a versão (pin válido ou corrente).
    select
      a.plano_id as plano_id,
      a.unidades as unidades,
      case
        when a.plano_versao_id is not null
             and (a.vigente_ate is null or a.vigente_ate >= now())
          then a.plano_versao_id
        else (select p.versao_corrente_id from public.planos p where p.id = a.plano_id)
      end as versao_id
    from public.assinaturas a
    where a.profile_id = uid
    union all
    -- Conta SEM assinatura: free implícito, versão corrente do free.
    select 'free', null::integer,
           (select versao_corrente_id from public.planos where id = 'free')
    where not exists (select 1 from public.assinaturas a where a.profile_id = uid)
  )
  select
    assi.plano_id,
    case when v.por_unidade
         then v.agenda_por_unidade * greatest(coalesce(assi.unidades, 1), 1)
         else v.capacidade_agenda end as capacidade_agenda,
    case
      when v.por_unidade
        then v.ativaveis_por_unidade * greatest(coalesce(assi.unidades, 1), 1)
      when v.vagas_ativas is not null
        then v.vagas_ativas
      else v.capacidade_agenda
    end as vagas_ativas,
    v.somente_leitura,
    v.permite_recorrente,
    v.cadencia_configuravel,
    v.menu_texto_livre,
    v.informado_pago_habilitado,
    v.totais_periodo,
    v.reengajamento_max,
    v.edicoes_max,
    assi.unidades
  from assi
  join public.plano_versoes v on v.id = assi.versao_id;
$$;

-- 7. Grants + RLS. A função é SQL stable (roda com permissão do chamador), então api e zap
--    precisam de SELECT em plano_versoes. O admin (api) INSERE versões ao editar.
grant select, insert on public.plano_versoes to whaviso_api;
grant select on public.plano_versoes to whaviso_zap;

alter table public.plano_versoes enable row level security;
create policy api_plano_versoes on public.plano_versoes for all to whaviso_api using (true) with check (true);
create policy zap_plano_versoes on public.plano_versoes for select to whaviso_zap using (true);

-- A função recriada perde os grants anteriores (0033 api / 0040 zap): re-concede aos dois.
grant execute on function public.alavancas_do_plano(uuid) to whaviso_api;
grant execute on function public.alavancas_do_plano(uuid) to whaviso_zap;
