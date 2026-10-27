-- Zonas de entrega: pedido minimo e frete gratis por zona (revisao de produto).
--
--   pedido_minimo_centavos        subtotal minimo para entregar na zona (NULL = sem minimo)
--   frete_gratis_acima_centavos   subtotal a partir do qual a taxa do cliente zera (NULL = sem frete gratis)
--
-- Dinheiro em centavos (integer), nunca negativo. Colunas anulaveis e sem default: zonas ja
-- cadastradas seguem como estavam (sem minimo, sem frete gratis). Os grants da 0007 sao de TABELA
-- (whaviso_api select/insert/update; whaviso_atendente select), entao cobrem as colunas novas sem
-- nenhum grant extra. Sem DELETE: a zona sai de cena com ativo = false.

alter table public.zonas_entrega
  add column if not exists pedido_minimo_centavos integer,
  add column if not exists frete_gratis_acima_centavos integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'zonas_minimo_frete_validos') then
    alter table public.zonas_entrega
      add constraint zonas_minimo_frete_validos check (
        (pedido_minimo_centavos is null or pedido_minimo_centavos >= 0)
        and (frete_gratis_acima_centavos is null or frete_gratis_acima_centavos >= 0)
      );
  end if;
end
$$;
