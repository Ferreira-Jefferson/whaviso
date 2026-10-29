-- Lock deterministico na baixa de estoque (deadlock entre efetivacoes concorrentes).
--
-- A funcao pedido_baixar_estoque (0055) trava as linhas de item e de insumo em loops cujas consultas
-- agregam com GROUP BY SEM ORDER BY: a ordem em que cada pedido adquire os locks (itens / insumos) era
-- nao deterministica. Dois pedidos que compartilham itens/insumos podiam travar os mesmos recursos em
-- ordens opostas e cair em deadlock (40P01), perdendo o pedido inteiro (o retry da api so capturava o
-- unique do codigo, nunca o deadlock).
--
-- Correcao PONTUAL: recria a funcao adicionando ORDER BY pela chave travada em cada loop (item_id no
-- loop de item, insumo_id no loop de insumo), para que toda transacao adquira os locks na MESMA ordem.
-- Todo o resto e IDENTICO a 0055 (inclusive greatest/clamp, idempotencia, SECURITY DEFINER e search_path):
-- a semantica de saldo nao muda. O trigger trg_pedido_baixa_estoque (0055) continua valido e nao e
-- recriado (create or replace preserva a ligacao com a funcao).

create or replace function public.pedido_baixar_estoque()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  f record;
  resultante_item integer;
  resultante_insumo numeric;
begin
  -- So a aresta de ENTRADA em 'novo' efetiva o pedido. Um UPDATE que mantem 'novo' (ex.: recalculo
  -- de totais ao cancelar uma linha) nao reprocessa a baixa.
  if tg_op = 'UPDATE' and old.status = 'novo' then
    return null;
  end if;

  -- (A) Baixa da contagem por item: agrega a quantidade do item entre as linhas ativas do pedido.
  -- ORDER BY item_id: ordem de lock deterministica entre pedidos concorrentes (evita deadlock 40P01).
  for r in
    select ip.item_id, sum(ip.quantidade)::integer as qtd
      from public.itens_pedido ip
     where ip.pedido_id = new.id
       and ip.loja_id = new.loja_id
       and not ip.cancelado
       and ip.item_id is not null
     group by ip.item_id
     order by ip.item_id
  loop
    if not exists (
      select 1 from public.movimentos_item_estoque
       where pedido_id = new.id and item_id = r.item_id and tipo = 'venda'
    ) then
      -- Trava a contagem do item na transacao antes de decrementar.
      perform 1 from public.itens
        where id = r.item_id and loja_id = new.loja_id
        for update;
      update public.itens i
         set quantidade_disponivel = greatest(0, i.quantidade_disponivel - r.qtd)
       where i.id = r.item_id
         and i.loja_id = new.loja_id
         and i.controla_estoque
         and i.quantidade_disponivel is not null
      returning i.quantidade_disponivel into resultante_item;
      -- found so e verdadeiro quando o item tinha contagem finita (controle ligado, nao ilimitado).
      if found then
        insert into public.movimentos_item_estoque
          (loja_id, item_id, tipo, quantidade, quantidade_resultante, pedido_id)
        values (new.loja_id, r.item_id, 'venda', r.qtd, resultante_item, new.id);
      end if;
    end if;
  end loop;

  -- (B) Baixa de insumos pela ficha tecnica: consumo total por insumo somando todos os itens do
  -- pedido que o usam (quantidade_na_ficha * quantidade_vendida_do_item).
  -- ORDER BY insumo_id: mesma ordem de lock deterministica no loop de insumo.
  for f in
    select ft.insumo_id, sum(ft.quantidade * agg.qtd)::numeric as consumo
      from (
        select ip.item_id, sum(ip.quantidade)::integer as qtd
          from public.itens_pedido ip
         where ip.pedido_id = new.id
           and ip.loja_id = new.loja_id
           and not ip.cancelado
           and ip.item_id is not null
         group by ip.item_id
      ) agg
      join public.fichas_tecnicas ft
        on ft.loja_id = new.loja_id and ft.item_id = agg.item_id and ft.ativo
     group by ft.insumo_id
     order by ft.insumo_id
  loop
    if not exists (
      select 1 from public.movimentos_insumo
       where pedido_id = new.id and insumo_id = f.insumo_id and tipo = 'consumo'
    ) then
      update public.insumos s
         set quantidade_atual = greatest(s.quantidade_atual - f.consumo, 0)
       where s.id = f.insumo_id and s.loja_id = new.loja_id
      returning s.quantidade_atual into resultante_insumo;
      if found then
        insert into public.movimentos_insumo
          (loja_id, insumo_id, tipo, quantidade, quantidade_resultante, pedido_id)
        values (new.loja_id, f.insumo_id, 'consumo', f.consumo, resultante_insumo, new.id);
      end if;
    end if;
  end loop;

  return null;
end;
$$;
