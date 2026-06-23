-- E11 (Planos): ajuste do PISO do Plus por envio. O total no piso (16 envios) deixa
-- de ser R$ 30,00 e passa a ser o preço do plano de cima (Profissional/"premium",
-- R$ 29,00 que cobre até 15 envios) + 1 envio arredondado pra cima (R$ 1,90):
--   piso(16) = 2900 + 190 = 3090  (R$ 30,90)
-- O topo (200 envios -> R$ 79,90 = 7990) e a faixa (16..200) seguem da 0045; só o
-- piso muda, então a curva interpolada inteira sobe um pouco. R$/envio no piso fica
-- ~R$ 1,93 (3090/16), contínuo com o premium (2900/15 = ~R$ 1,93).
--
-- Regras de ouro: dinheiro em centavos; catálogo em migration upsert idempotente
-- (chega ao cloud via `supabase db push`). Numeração: última = 0045; esta é 0046.

update public.planos
   set preco_centavos = 3090  -- piso: premium (2900) + 1 envio arredondado (190)
 where id = 'plus';
