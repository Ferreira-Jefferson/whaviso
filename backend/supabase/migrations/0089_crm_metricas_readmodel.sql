-- Read-model das metricas de CRM (RFM), pronto para volume.
--
-- ANTES: a view `clientes_metricas` (0034) agregava TODOS os pedidos entregues da loja a cada
-- leitura. `crm.listar` ordena por `gasto_total_centavos` (valor calculado), entao o Postgres
-- montava a view inteira da loja e ordenava tudo para devolver uma pagina de 20. O cursor keyset
-- nao evitava o trabalho: O(clientes x pedidos) por pagina.
--
-- AGORA: os agregados de entregues que NAO dependem do tempo (contagem, gasto, primeira e ultima
-- entrega) viram colunas em `clientes`, mantidas na MESMA transacao por um trigger no `pedidos`
-- (mesmo padrao da 0083, mas filtrando status = 'entregue', que e a base do RFM). A view le essas
-- colunas direto e so a janela movel de 180 dias (que desliza com o tempo) fica num LATERAL
-- correlacionado. Com indice em `clientes (loja_id, gasto_total desc, id)`, o `crm.listar` sem
-- filtro de segmento ordena+pagina pelo indice e so avalia o lateral das 20 linhas da pagina.
--
-- A SAIDA da view (nomes e tipos das colunas) fica IDENTICA a da 0034, entao crm/repo.ts e
-- campanhas/repo.ts nao mudam: os mesmos campos, os mesmos valores.
--
-- Limite conhecido (follow-up): `segmento` depende da janela de 180 dias, que desliza por tempo.
-- Por isso `crm.resumo`, `campanhas.contarDestinatarios`/`enfileirar` e o `crm.listar` FILTRADO por
-- segmento ainda varrem a loja (precisam do segmento de cada cliente). Persistir o segmento exige
-- um refresh periodico (job), decisao de arquitetura separada. Esta migration resolve o caminho
-- quente (listar paginado sem filtro, e o detalhe de um cliente).

begin;

-- Agregados de ENTREGUES por cliente (independentes do tempo). Distintos dos de 0083, que contam
-- pedidos EFETIVOS (status <> 'rascunho'); aqui so entregue, com data = coalesce(entregue_em, criado_em).
alter table public.clientes
  add column entregues_total integer not null default 0,
  add column gasto_entregue_centavos bigint not null default 0,
  add column primeiro_entregue_em timestamptz,
  add column ultimo_entregue_em timestamptz;

-- Backfill a partir dos pedidos entregues.
update public.clientes c
   set entregues_total = coalesce(sub.n, 0),
       gasto_entregue_centavos = coalesce(sub.g, 0),
       primeiro_entregue_em = sub.primeiro,
       ultimo_entregue_em = sub.ultimo
  from (
    select cliente_id,
           count(*)::int as n,
           sum(total_centavos)::bigint as g,
           min(coalesce(entregue_em, criado_em)) as primeiro,
           max(coalesce(entregue_em, criado_em)) as ultimo
      from public.pedidos
     where status = 'entregue' and cliente_id is not null
     group by cliente_id
  ) sub
 where sub.cliente_id = c.id;

-- Serve o `order by gasto_total_centavos desc, cliente_id desc` + o cursor do crm.listar sem filtro.
create index clientes_loja_gasto on public.clientes (loja_id, gasto_entregue_centavos desc, id desc);

-- Serve o LATERAL da janela 180d (por cliente) e o crm.itensMaisVendidos/itensFavoritos (por loja),
-- ambos sobre pedidos entregues com data = coalesce(entregue_em, criado_em).
create index pedidos_cliente_entregue on public.pedidos
  (cliente_id, (coalesce(entregue_em, criado_em)))
  where status = 'entregue' and cliente_id is not null;
create index pedidos_loja_entregue on public.pedidos
  (loja_id, (coalesce(entregue_em, criado_em)))
  where status = 'entregue';

-- Recalcula os agregados de entregues de UM cliente a partir dos pedidos (fonte da verdade). O
-- subselect sempre devolve uma linha (zera certo quando nao ha pedido entregue).
create or replace function public.cliente_recalc_entregues(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_cliente is null then
    return;
  end if;
  update public.clientes c
     set entregues_total = coalesce(sub.n, 0),
         gasto_entregue_centavos = coalesce(sub.g, 0),
         primeiro_entregue_em = sub.primeiro,
         ultimo_entregue_em = sub.ultimo
    from (
      select count(*)::int as n,
             sum(total_centavos)::bigint as g,
             min(coalesce(entregue_em, criado_em)) as primeiro,
             max(coalesce(entregue_em, criado_em)) as ultimo
        from public.pedidos
       where cliente_id = p_cliente and status = 'entregue'
    ) sub
   where c.id = p_cliente;
end;
$$;

-- Trigger: recalcula o(s) cliente(s) afetado(s). Numa troca de cliente, recalcula os dois.
create or replace function public.cliente_sincronizar_entregues()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.cliente_recalc_entregues(old.cliente_id);
  elsif tg_op = 'UPDATE' then
    perform public.cliente_recalc_entregues(new.cliente_id);
    if new.cliente_id is distinct from old.cliente_id then
      perform public.cliente_recalc_entregues(old.cliente_id);
    end if;
  else -- INSERT
    perform public.cliente_recalc_entregues(new.cliente_id);
  end if;
  return null;
end;
$$;

-- So dispara na aresta que muda a contribuicao de entregues: cruzar a fronteira entregue<->nao,
-- trocar de cliente, ou mexer em valor/data de um pedido entregue. NAO dispara em rascunho/novo etc.
create trigger trg_pedido_sync_entregue_ins
  after insert on public.pedidos
  for each row
  when (new.cliente_id is not null and new.status = 'entregue')
  execute function public.cliente_sincronizar_entregues();

create trigger trg_pedido_sync_entregue_del
  after delete on public.pedidos
  for each row
  when (old.cliente_id is not null and old.status = 'entregue')
  execute function public.cliente_sincronizar_entregues();

create trigger trg_pedido_sync_entregue_upd
  after update on public.pedidos
  for each row
  when (
    (old.status = 'entregue') is distinct from (new.status = 'entregue')
    or old.cliente_id is distinct from new.cliente_id
    or (new.status = 'entregue' and (
         old.total_centavos is distinct from new.total_centavos
      or old.entregue_em is distinct from new.entregue_em
      or old.criado_em is distinct from new.criado_em))
  )
  execute function public.cliente_sincronizar_entregues();

-- Reescreve a view: campos independentes do tempo vem das colunas; so a janela 180d fica no lateral.
-- Mesma saida (nomes, tipos, formulas das notas e do segmento) da 0034.
drop view public.clientes_metricas;
create view public.clientes_metricas with (security_invoker = true) as
with base as (
  select c.loja_id, c.id as cliente_id, c.nome,
         c.entregues_total as pedidos_total,
         c.gasto_entregue_centavos as gasto_total_centavos,
         case when c.entregues_total = 0 then 0
              else (c.gasto_entregue_centavos / c.entregues_total)::int end as ticket_medio_centavos,
         c.primeiro_entregue_em as primeiro_pedido_em,
         c.ultimo_entregue_em as ultimo_pedido_em,
         case when c.ultimo_entregue_em is null then null
              else ((now() at time zone 'America/Sao_Paulo')::date
                    - (c.ultimo_entregue_em at time zone 'America/Sao_Paulo')::date) end as recencia_dias,
         coalesce(j.pedidos_180d, 0) as pedidos_180d,
         coalesce(j.gasto_180d_centavos, 0)::bigint as gasto_180d_centavos,
         coalesce(k.opt_out_marketing, false) as opt_out_marketing
    from public.clientes c
    left join public.cliente_consentimento k on k.cliente_id = c.id
    left join lateral (
      select count(*)::int as pedidos_180d,
             coalesce(sum(p.total_centavos), 0)::bigint as gasto_180d_centavos
        from public.pedidos p
       where p.cliente_id = c.id and p.loja_id = c.loja_id and p.status = 'entregue'
         and coalesce(p.entregue_em, p.criado_em) >= now() - interval '180 days'
    ) j on true
),
notas as (
  select b.*,
         case when b.pedidos_total = 0 then null
              when b.recencia_dias <= 7 then 5 when b.recencia_dias <= 15 then 4
              when b.recencia_dias <= 30 then 3 when b.recencia_dias <= 60 then 2 else 1 end as nota_r,
         case when b.pedidos_total = 0 then null
              when b.pedidos_180d >= 10 then 5 when b.pedidos_180d >= 6 then 4
              when b.pedidos_180d >= 3 then 3 when b.pedidos_180d >= 2 then 2 else 1 end as nota_f,
         case when b.pedidos_total = 0 then null
              when b.gasto_180d_centavos >= 50000 then 5 when b.gasto_180d_centavos >= 25000 then 4
              when b.gasto_180d_centavos >= 10000 then 3 when b.gasto_180d_centavos >= 5000 then 2
              else 1 end as nota_m
    from base b
)
select n.*,
       case when n.pedidos_total = 0 then 'sem_pedido'
            when n.nota_r >= 4 and n.nota_f >= 4 then 'campeao'
            when n.nota_r >= 3 and n.nota_f >= 3 then 'fiel'
            when n.nota_r <= 2 and n.nota_f >= 3 then 'em_risco'
            when n.pedidos_total = 1 and n.nota_r >= 3 then 'novo'
            when n.nota_r = 1 then 'perdido'
            else 'ocasional' end as segmento
  from notas n;

grant select on public.clientes_metricas to whaviso_api;

commit;
