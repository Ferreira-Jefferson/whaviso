-- E11 (Planos): a "vaga de aviso ativo" vira o EIXO comercial dos planos, vendida
-- como "envios de aviso". A escada fica contínua: Free 0, Start 10, Profissional 25,
-- Plus de 26 a 200. A capacidade de AGENDA (balde único: anotar) NÃO muda
-- (Free 50, Start 100, Profissional 150); o que passa a ter teto explícito é quantos
-- combinados a conta mantém ATIVOS enviando ao mesmo tempo (`vagas_ativas`), já
-- imposto por `exigirVagaDeAtivo` (a coluna só estava nula = "= capacidade", sem teto).
--
-- Preços:
--   * Profissional: R$ 29,00 -> R$ 29,90 (2900 -> 2990). Cobre 25 envios de aviso;
--     R$/envio = 2990/25 = R$ 1,196.
--   * Plus (por volume de envios, curva linear no TOTAL da migration 0045): faixa
--     16..200 -> 26..200, contínua com o Profissional (26 = um envio acima de 25).
--       piso(26)  = 3110  (R$ 31,10; R$/envio = 1,196, igual ao Profissional)
--       topo(200) = 14000 (R$ 140,00; R$/envio = 0,70)
--     O R$/envio cai progressivamente (1,196 -> ~0,70) e fica SEMPRE acima do custo
--     (R$ 0,53 no pior caso), garantindo margem mesmo no topo. Pontos da curva
--     (interpolação linear do total, R$/envio = total/n):
--        26 -> R$  31,10 (1,196/envio)
--        50 -> R$  46,12 (0,922/envio)
--       100 -> R$  77,41 (0,774/envio)
--       150 -> R$ 108,71 (0,725/envio)
--       200 -> R$ 140,00 (0,700/envio)
--
-- Regras de ouro: dinheiro em centavos; catálogo em migration upsert idempotente
-- (chega ao cloud via `supabase db push`, o seed não roda lá); sem DELETE de negócio
-- (só UPDATE do catálogo). Numeração: última = 0048; esta é 0049.

-- 1. Profissional: preço 29,90 e teto explícito de 25 vagas de aviso ativo.
update public.planos
   set preco_centavos = 2990,
       vagas_ativas = 25
 where id = 'profissional';

-- 2. Start: teto explícito de 10 vagas de aviso ativo (agenda segue em 100).
update public.planos
   set vagas_ativas = 10
 where id = 'start';

-- 3. Plus: faixa 26..200 e curva nova (piso 31,10 contínuo com o Profissional;
--    topo 140,00 = R$ 0,70/envio). envios_max segue 200.
update public.planos
   set envios_min = 26,
       preco_centavos = 3110,      -- total no piso (26 envios): R$ 31,10
       preco_max_centavos = 14000  -- total no topo (200 envios): R$ 140,00 (0,70/envio)
 where id = 'plus';

-- Free permanece somente_leitura (0 envios de aviso) e Plus segue por_unidade
-- (vagas resolvidas 1:1 com os envios em alavancas_do_plano); nada a alterar neles.
