-- CRM do restaurante sobre o consumidor final: consentimento (opt-out) e metricas RFM.
--
--   cliente_consentimento  uma linha por (loja, cliente) com o opt-out de marketing. Ausencia de
--                          linha = sem opt-out registrado (pode receber). Sem DELETE: o estado muda
--                          por flag (opt_out_marketing true/false), com carimbos e origem.
--   clientes_metricas      read-model (view) com recencia, frequencia e valor (RFM) por cliente.
--
-- Regras do RFM (centralizadas aqui, a api so le):
--   * Conta como compra apenas pedido `entregue` (data = entregue_em, senao criado_em).
--   * Recencia em dias corridos de America/Sao_Paulo desde a ultima compra.
--   * Frequencia e valor numa janela movel de 180 dias; os totais historicos ficam a parte.
--   * Notas 1 a 5 por faixas fixas (determinísticas, sem ntile): estaveis para loja pequena.
--       R: <=7d 5 | <=15d 4 | <=30d 3 | <=60d 2 | mais 1
--       F: >=10 pedidos 5 | >=6 4 | >=3 3 | >=2 2 | demais 1
--       M: >=R$500 5 | >=R$250 4 | >=R$100 3 | >=R$50 2 | demais 1   (centavos)
--   * Segmento derivado das notas (ver CASE abaixo).
-- Dinheiro em centavos. Sem dado pessoal na view alem do nome ja existente em `clientes`.

create table public.cliente_consentimento (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id),
  opt_out_marketing boolean not null default false,
  opt_out_em timestamptz,                       -- quando o opt-out mais recente foi registrado
  opt_in_em timestamptz,                        -- quando voltou a aceitar (reversao)
  origem text not null default 'painel'
    check (origem in ('painel', 'cliente_whatsapp', 'importacao')),
  motivo text,
  atualizado_por_user_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint cliente_consentimento_motivo_tamanho check (motivo is null or char_length(motivo) <= 200),
  constraint cliente_consentimento_optout_tem_data check (not opt_out_marketing or opt_out_em is not null)
);
-- Uma linha por cliente (o par loja+cliente e a chave natural; loja_id evita join para isolar tenant).
create unique index cliente_consentimento_cliente on public.cliente_consentimento (cliente_id);
create index cliente_consentimento_loja on public.cliente_consentimento (loja_id, opt_out_marketing);

create trigger trg_cliente_consentimento_atualizado_em before update on public.cliente_consentimento
  for each row execute function public.tocar_atualizado_em();

alter table public.cliente_consentimento enable row level security;

-- api: painel registra/reverte opt-out (SELECT/INSERT/UPDATE; sem DELETE).
grant select, insert, update on public.cliente_consentimento to whaviso_api;
create policy api_cliente_consentimento on public.cliente_consentimento
  for all to whaviso_api using (true) with check (true);

-- View de metricas. security_invoker: roda com o privilegio de quem consulta (RLS das tabelas base).
create view public.clientes_metricas with (security_invoker = true) as
with entregues as (
  select p.loja_id, p.cliente_id, p.total_centavos,
         coalesce(p.entregue_em, p.criado_em) as quando
    from public.pedidos p
   where p.status = 'entregue' and p.cliente_id is not null
),
agg as (
  select loja_id, cliente_id,
         count(*)::int as pedidos_total,
         sum(total_centavos)::bigint as gasto_total_centavos,
         min(quando) as primeiro_pedido_em,
         max(quando) as ultimo_pedido_em,
         (count(*) filter (where quando >= now() - interval '180 days'))::int as pedidos_180d,
         coalesce(sum(total_centavos) filter (where quando >= now() - interval '180 days'), 0)::bigint
           as gasto_180d_centavos
    from entregues
   group by loja_id, cliente_id
),
base as (
  select c.loja_id, c.id as cliente_id, c.nome,
         coalesce(a.pedidos_total, 0) as pedidos_total,
         coalesce(a.gasto_total_centavos, 0)::bigint as gasto_total_centavos,
         case when coalesce(a.pedidos_total, 0) = 0 then 0
              else (coalesce(a.gasto_total_centavos, 0) / a.pedidos_total)::int end as ticket_medio_centavos,
         a.primeiro_pedido_em, a.ultimo_pedido_em,
         case when a.ultimo_pedido_em is null then null
              else ((now() at time zone 'America/Sao_Paulo')::date
                    - (a.ultimo_pedido_em at time zone 'America/Sao_Paulo')::date) end as recencia_dias,
         coalesce(a.pedidos_180d, 0) as pedidos_180d,
         coalesce(a.gasto_180d_centavos, 0)::bigint as gasto_180d_centavos,
         coalesce(k.opt_out_marketing, false) as opt_out_marketing
    from public.clientes c
    left join agg a on a.cliente_id = c.id and a.loja_id = c.loja_id
    left join public.cliente_consentimento k on k.cliente_id = c.id
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

-- A view herda RLS das tabelas base (security_invoker); a api so le.
grant select on public.clientes_metricas to whaviso_api;
