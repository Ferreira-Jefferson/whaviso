-- Oversell do item do cardapio (historia 03) + baixa de estoque do salao (historia 07).
--
-- Constroi POR CIMA do 0075 (lock deterministico). Tres mudancas:
--
-- (1) pedido_baixar_estoque: o loop de ITEM deixa de CLAMPAR em zero e passa a RECUSAR a baixa
--     (RAISE) quando o saldo e insuficiente. Item com contador nunca vai a negativo: a venda que
--     excederia o saldo erra a transacao inteira. Backstop do banco; a recusa amigavel acontece
--     antes, na api (service de pedidos, sob FOR UPDATE). O loop de INSUMO continua CLAMPANDO em
--     zero (greatest), exatamente como no 0075 (semantica de insumo inalterada). ORDER BY,
--     idempotencia, SECURITY DEFINER e search_path preservados.
--
-- (2) comanda_id nas duas trilhas de movimento de estoque (movimentos_item_estoque e
--     movimentos_insumo), para a baixa do salao referenciar a comanda (o ledger nasceu amarrado so
--     a pedido_id). Indices parciais de idempotencia por (comanda, item) e (comanda, insumo).
--
-- (3) comanda_baixar_estoque + trigger trg_comanda_baixa_estoque: ao FECHAR a comanda (aresta
--     aberta -> fechada), da baixa de item e insumo dos comanda_itens seguindo a MESMA logica da
--     venda (item recusa quando falta; insumo clampa em zero). Idempotente pela aresta de estado e
--     pelos indices parciais. O recebimento no caixa e lancado pela api (precisa da forma de
--     pagamento), na mesma transacao do fechamento.

-- ---------------------------------------------------------------- (2) comanda_id nos ledgers
alter table public.movimentos_item_estoque
  add column comanda_id uuid references public.comandas (id);
alter table public.movimentos_insumo
  add column comanda_id uuid references public.comandas (id);

create index movimentos_item_estoque_comanda on public.movimentos_item_estoque (comanda_id)
  where comanda_id is not null;
create index movimentos_insumo_comanda on public.movimentos_insumo (comanda_id)
  where comanda_id is not null;

-- Idempotencia da baixa por comanda: no maximo um 'venda' por (comanda, item) e um 'consumo' por
-- (comanda, insumo), espelhando os indices por pedido (0023/0063).
create unique index movimentos_item_venda_comanda_idempotente
  on public.movimentos_item_estoque (comanda_id, item_id)
  where tipo = 'venda' and comanda_id is not null;
create unique index movimentos_insumo_consumo_comanda_idempotente
  on public.movimentos_insumo (comanda_id, insumo_id)
  where tipo = 'consumo' and comanda_id is not null;

-- O role whaviso_api fecha a comanda; a baixa roda em SECURITY DEFINER (dono da funcao), entao nao
-- precisa de grant de insert de comanda_id para a api.

-- ---------------------------------------------------------------- (1) baixa do pedido recusa oversell
create or replace function public.pedido_baixar_estoque()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  f record;
  saldo_atual integer;
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
      -- Trava e le a contagem do item (so quando controla contagem finita) antes de decrementar.
      select i.quantidade_disponivel into saldo_atual
        from public.itens i
       where i.id = r.item_id
         and i.loja_id = new.loja_id
         and i.controla_estoque
         and i.quantidade_disponivel is not null
       for update;
      -- found so e verdadeiro quando o item tem contagem finita (controle ligado, nao ilimitado).
      if found then
        -- Item com contador NAO vai a negativo: a venda que excederia o saldo recusa a baixa (e,
        -- com ela, a transacao inteira). A api ja recusa antes, amigavelmente; isto e o backstop
        -- (inclusive para o caminho do atendente, que escreve direto no banco).
        if saldo_atual < r.qtd then
          raise exception 'estoque insuficiente para o item % (saldo %, pedido %)', r.item_id, saldo_atual, r.qtd
            using errcode = 'WHV01';
        end if;
        update public.itens i
           set quantidade_disponivel = i.quantidade_disponivel - r.qtd
         where i.id = r.item_id
           and i.loja_id = new.loja_id
        returning i.quantidade_disponivel into resultante_item;
        insert into public.movimentos_item_estoque
          (loja_id, item_id, tipo, quantidade, quantidade_resultante, pedido_id)
        values (new.loja_id, r.item_id, 'venda', r.qtd, resultante_item, new.id);
      end if;
    end if;
  end loop;

  -- (B) Baixa de insumos pela ficha tecnica: consumo total por insumo somando todos os itens do
  -- pedido que o usam (quantidade_na_ficha * quantidade_vendida_do_item).
  -- INSUMO MANTEM CLAMP EM ZERO (greatest): nao barra, nao vai a negativo. Igual ao 0075.
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

-- ---------------------------------------------------------------- (3) baixa de estoque do salao
-- Mesma logica da venda, lendo de comanda_itens. Dispara na aresta aberta -> fechada da comanda.
-- Item: recusa quando falta saldo (nunca negativo). Insumo: clampa em zero. Idempotente pela
-- aresta de estado e pelos indices parciais por comanda. Roda DENTRO da transacao do fechamento.
create or replace function public.comanda_baixar_estoque()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  f record;
  saldo_atual integer;
  resultante_item integer;
  resultante_insumo numeric;
begin
  -- So a aresta aberta -> fechada efetiva a baixa (idempotente por estado).
  if old.status <> 'aberta' or new.status <> 'fechada' then
    return null;
  end if;

  -- (A) Contagem por item dos comanda_itens. ORDER BY item_id: lock deterministico (evita deadlock
  -- com pedidos concorrentes, que travam itens na mesma ordem).
  for r in
    select ci.item_id, sum(ci.quantidade)::integer as qtd
      from public.comanda_itens ci
     where ci.comanda_id = new.id
       and ci.loja_id = new.loja_id
       and ci.item_id is not null
     group by ci.item_id
     order by ci.item_id
  loop
    if not exists (
      select 1 from public.movimentos_item_estoque
       where comanda_id = new.id and item_id = r.item_id and tipo = 'venda'
    ) then
      select i.quantidade_disponivel into saldo_atual
        from public.itens i
       where i.id = r.item_id
         and i.loja_id = new.loja_id
         and i.controla_estoque
         and i.quantidade_disponivel is not null
       for update;
      if found then
        if saldo_atual < r.qtd then
          raise exception 'estoque insuficiente para o item % (saldo %, comanda %)', r.item_id, saldo_atual, r.qtd
            using errcode = 'WHV01';
        end if;
        update public.itens i
           set quantidade_disponivel = i.quantidade_disponivel - r.qtd
         where i.id = r.item_id
           and i.loja_id = new.loja_id
        returning i.quantidade_disponivel into resultante_item;
        insert into public.movimentos_item_estoque
          (loja_id, item_id, tipo, quantidade, quantidade_resultante, comanda_id)
        values (new.loja_id, r.item_id, 'venda', r.qtd, resultante_item, new.id);
      end if;
    end if;
  end loop;

  -- (B) Insumos pela ficha tecnica. Clamp em zero (greatest), igual a venda.
  for f in
    select ft.insumo_id, sum(ft.quantidade * agg.qtd)::numeric as consumo
      from (
        select ci.item_id, sum(ci.quantidade)::integer as qtd
          from public.comanda_itens ci
         where ci.comanda_id = new.id
           and ci.loja_id = new.loja_id
           and ci.item_id is not null
         group by ci.item_id
      ) agg
      join public.fichas_tecnicas ft
        on ft.loja_id = new.loja_id and ft.item_id = agg.item_id and ft.ativo
     group by ft.insumo_id
     order by ft.insumo_id
  loop
    if not exists (
      select 1 from public.movimentos_insumo
       where comanda_id = new.id and insumo_id = f.insumo_id and tipo = 'consumo'
    ) then
      update public.insumos s
         set quantidade_atual = greatest(s.quantidade_atual - f.consumo, 0)
       where s.id = f.insumo_id and s.loja_id = new.loja_id
      returning s.quantidade_atual into resultante_insumo;
      if found then
        insert into public.movimentos_insumo
          (loja_id, insumo_id, tipo, quantidade, quantidade_resultante, comanda_id)
        values (new.loja_id, f.insumo_id, 'consumo', f.consumo, resultante_insumo, new.id);
      end if;
    end if;
  end loop;

  return null;
end;
$$;

create trigger trg_comanda_baixa_estoque
  after update on public.comandas
  for each row
  when (new.status = 'fechada' and old.status = 'aberta')
  execute function public.comanda_baixar_estoque();
