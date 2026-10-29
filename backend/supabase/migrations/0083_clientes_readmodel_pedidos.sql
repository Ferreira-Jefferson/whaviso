-- Item 30 (B5): read-model de pedidos no cliente, mantido por trigger (pronto para volume).
--
-- ANTES: a listagem de clientes (clientes/repo.ts `listar`) fazia um LEFT JOIN LATERAL por linha,
-- contando pedidos (status <> 'rascunho') e tirando max(criado_em), e ordenava pela coluna
-- computada `ultima`. Com volume, o Postgres materializa o agregado de TODO cliente da loja antes
-- de ordenar, e o cursor nao evita esse trabalho: O(clientes x pedidos) por pagina.
--
-- AGORA: `clientes.pedidos_total` e `clientes.ultimo_pedido_em` guardam o agregado, mantido na
-- MESMA transacao por um trigger no `pedidos`. A listagem le colunas prontas e ordena por
-- `ordenado_em` (coluna GERADA = greatest(criado_em, coalesce(ultimo_pedido_em, criado_em))), com
-- indice btree que serve o `order by` + o cursor direto. O(log n) por pagina.
--
-- POR QUE UM TRIGGER NO BANCO (e nao codigo da api): pedidos sao escritos por DOIS caminhos
-- independentes (o painel/api e o motor do atendente, que escreve direto no banco compartilhado) e
-- o modulo pedidos nao pode importar o modulo clientes (fronteira feature-first). O trigger e o
-- unico ponto que dispara igual para os dois caminhos, dentro da transacao do pedido. SECURITY
-- DEFINER para atualizar `clientes` sob qualquer role (whaviso_api e whaviso_atendente); search_path
-- fixo para nao ser sequestrado. (`clientes.atualizado_em` nao e lido pelo app, entao o bump do
-- trigger `tocar_atualizado_em` no recalculo e inocuo.)

begin;

alter table public.clientes
  add column pedidos_total integer not null default 0,
  add column ultimo_pedido_em timestamptz;

-- Backfill a partir dos pedidos efetivos (exclui rascunho, igual a listagem).
update public.clientes c
   set pedidos_total = coalesce(sub.n, 0),
       ultimo_pedido_em = sub.ultimo
  from (
    select cliente_id, count(*)::int as n, max(criado_em) as ultimo
      from public.pedidos
     where status <> 'rascunho' and cliente_id is not null
     group by cliente_id
  ) sub
 where sub.cliente_id = c.id;

-- Coluna de ordenacao da listagem, derivada: recalcula sozinha quando ultimo_pedido_em muda.
alter table public.clientes
  add column ordenado_em timestamptz
    generated always as (greatest(criado_em, coalesce(ultimo_pedido_em, criado_em))) stored;

-- Serve o `order by ordenado_em desc, id desc` + o cursor da listagem direto do indice.
create index clientes_loja_ordenado on public.clientes (loja_id, ordenado_em desc, id desc);
-- Serve o recalculo por cliente (count/max dos pedidos efetivos daquele cliente).
create index pedidos_cliente_efetivo on public.pedidos (cliente_id, criado_em desc)
  where status <> 'rascunho' and cliente_id is not null;

-- Recalcula o agregado de UM cliente a partir dos pedidos (fonte da verdade). O subselect agregado
-- sempre devolve uma linha (n=0, ultimo=null quando nao ha pedido efetivo), entao tambem ZERA certo.
create or replace function public.cliente_recalc_pedidos(p_cliente uuid)
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
     set pedidos_total = coalesce(sub.n, 0),
         ultimo_pedido_em = sub.ultimo
    from (
      select count(*)::int as n, max(criado_em) as ultimo
        from public.pedidos
       where cliente_id = p_cliente and status <> 'rascunho'
    ) sub
   where c.id = p_cliente;
end;
$$;

-- Trigger: recalcula o(s) cliente(s) afetado(s). Numa troca de cliente do pedido, recalcula os dois.
create or replace function public.cliente_sincronizar_pedidos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.cliente_recalc_pedidos(old.cliente_id);
  elsif tg_op = 'UPDATE' then
    perform public.cliente_recalc_pedidos(new.cliente_id);
    if new.cliente_id is distinct from old.cliente_id then
      perform public.cliente_recalc_pedidos(old.cliente_id);
    end if;
  else -- INSERT
    perform public.cliente_recalc_pedidos(new.cliente_id);
  end if;
  return null;
end;
$$;

-- Tres triggers com WHEN enxuto: NAO dispara em rascunho (carrinho do atendente) nem em update
-- irrelevante (ex.: trocar motoboy). So a aresta que cruza rascunho<->efetivo, troca de cliente ou
-- mexe no criado_em de um pedido efetivo recalcula.
create trigger trg_pedido_sync_cliente_ins
  after insert on public.pedidos
  for each row
  when (new.cliente_id is not null and new.status <> 'rascunho')
  execute function public.cliente_sincronizar_pedidos();

create trigger trg_pedido_sync_cliente_del
  after delete on public.pedidos
  for each row
  when (old.cliente_id is not null and old.status <> 'rascunho')
  execute function public.cliente_sincronizar_pedidos();

create trigger trg_pedido_sync_cliente_upd
  after update on public.pedidos
  for each row
  when (
    old.cliente_id is distinct from new.cliente_id
    or (old.status = 'rascunho') is distinct from (new.status = 'rascunho')
    or (new.status <> 'rascunho' and old.criado_em is distinct from new.criado_em)
  )
  execute function public.cliente_sincronizar_pedidos();

commit;
