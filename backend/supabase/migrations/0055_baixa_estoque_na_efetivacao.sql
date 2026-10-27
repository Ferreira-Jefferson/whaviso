-- G2: baixa automatica de estoque e insumo na EFETIVACAO do pedido.
--
-- "Vendeu, baixou": quando um pedido e efetivado (entra em 'novo', seja criado assim pelo painel
-- ou confirmado pelo atendente num rascunho -> novo), decrementa na MESMA transacao:
--   (A) a contagem por item do cardapio (itens.quantidade_disponivel);
--   (B) os insumos da ficha tecnica de cada item (explosao item -> insumos).
--
-- POR QUE UM TRIGGER (e nao codigo da api):
-- O pedido e efetivado por DOIS caminhos independentes: o painel (api) e o motor do atendente,
-- que escreve direto no banco compartilhado (api e atendente NUNCA se importam, so se integram
-- pelo banco). Alem disso o modulo pedidos nao pode importar os modulos estoque_* (fronteira
-- feature-first). Um trigger no nivel do banco e o unico ponto que dispara igual para os dois
-- caminhos, dentro da mesma transacao do pedido. Ele e DEFERRABLE INITIALLY DEFERRED porque no
-- caminho do painel as linhas (itens_pedido) sao inseridas DEPOIS da linha do pedido: so no
-- COMMIT os itens ja existem para serem lidos.
--
-- REGRAS (as mesmas das funcoes TS decrementarPorVenda / consumirInsumo / darBaixaPorVenda, que
-- seguem como referencia testada; a logica de producao passa a viver aqui):
--   - Nunca deixa saldo negativo: decrementa no maximo ate zero (greatest(..., 0)).
--   - Item sem controle de estoque, ou com contagem ILIMITADA (quantidade_disponivel NULL): no-op
--     (nada a decrementar, nenhum movimento gravado).
--   - Item SEM ficha tecnica: nao gera baixa de insumo (join nao casa).
--   - Idempotente: efetivar uma vez decrementa uma vez. Garantido por (i) so processar a aresta de
--     entrada em 'novo' e (ii) checar/registrar no maximo um movimento 'venda' por (pedido, item)
--     e um 'consumo' por (pedido, insumo). O indice unico parcial movimentos_item_venda_idempotente
--     (migration 0023) e rede de seguranca da parte (A).
--   - Insumo compartilhado por itens diferentes do mesmo pedido: o consumo e SOMADO entre os itens
--     (um unico movimento 'consumo' por insumo, com a quantidade total), que e a baixa correta e
--     ainda idempotente por (pedido, insumo).
--
-- SECURITY DEFINER: roda como o dono da funcao (que tem os privilegios nas tabelas de estoque),
-- para disparar uniformemente sob whaviso_api e whaviso_atendente sem depender dos grants de cada
-- role. search_path fixo para nao ser sequestrado.

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
  for r in
    select ip.item_id, sum(ip.quantidade)::integer as qtd
      from public.itens_pedido ip
     where ip.pedido_id = new.id
       and ip.loja_id = new.loja_id
       and not ip.cancelado
       and ip.item_id is not null
     group by ip.item_id
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

-- Trigger de restricao DEFERIDO: enfileira na aresta do evento (INSERT/UPDATE com status 'novo')
-- e executa no COMMIT, quando as linhas do pedido ja existem. WHEN so referencia NEW (valido para
-- INSERT e UPDATE); a aresta exata de entrada em 'novo' e refinada dentro da funcao.
create constraint trigger trg_pedido_baixa_estoque
  after insert or update on public.pedidos
  deferrable initially deferred
  for each row
  when (new.status = 'novo')
  execute function public.pedido_baixar_estoque();
