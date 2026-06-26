-- Épico 11 (H11.3): a curva de preço de créditos deixa de ser de DOIS pontos
-- (total no piso -> total no topo, interpolação linear) e passa a ser uma curva de
-- MARCOS: uma tabela de (envios -> R$/envio) em centavos. O R$/envio entre dois
-- marcos é interpolado linearmente, passando exatamente pelos valores da tabela; o
-- total de uma compra de n envios é round(n * R$/envio(n)). Slider segue por
-- quantidade livre (sem pacotes fixos), só que agora a redução de preço acompanha
-- os marcos definidos pelo owner. Editável em runtime (H11.11).
--
-- Tabela aprovada (2026-06-26), faixa 10..250 (500 era cliente demais; 250 é o teto):
--   10 -> R$ 0,99 (total R$ 9,90, mesmo preço inicial de antes) | 25 -> R$ 0,95 |
--   50 -> R$ 0,90 | 100 -> R$ 0,85 | 150 -> R$ 0,80 | 200 -> R$ 0,75 | 250 -> R$ 0,70
--   (centavos por envio).

-- 1. Nova coluna `curva`: array jsonb de marcos {envios, centavos} (centavos = R$/envio).
--    O default já é a tabela aprovada, então a linha única (id=1) e qualquer insert
--    futuro nascem com a curva correta.
alter table public.creditos_catalogo
  add column if not exists curva jsonb not null default
    '[{"envios":10,"centavos":99},{"envios":25,"centavos":95},{"envios":50,"centavos":90},{"envios":100,"centavos":85},{"envios":150,"centavos":80},{"envios":200,"centavos":75},{"envios":250,"centavos":70}]'::jsonb;

-- 2. Faixa do slider passa a 10..250 (derivada da curva: primeiro/último marco).
update public.creditos_catalogo set envios_min = 10, envios_max = 250 where id = 1;

-- 3. Sai o modelo de dois pontos (total no piso/topo) e entra a CHECK da curva
--    (ao menos 2 marcos). O R$/envio cai pela tabela, não mais por preco_centavos.
alter table public.creditos_catalogo
  drop constraint if exists creditos_catalogo_preco,
  drop column if exists preco_centavos,
  drop column if exists preco_max_centavos,
  add constraint creditos_catalogo_curva check (jsonb_array_length(curva) >= 2);
