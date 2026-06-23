-- E11 (Planos): o Plus deixa de ter preço LINEAR por unidade (R$ X * unidades) e
-- passa a ter preço por VOLUME DE ENVIOS com desconto progressivo: o cliente
-- escolhe quantos envios/mês quer (de `envios_min` a `envios_max`) e o preço por
-- envio CAI conforme o volume sobe, de modo que o total a `envios_max` fique abaixo
-- do teto definido. Objetivo de produto: o desconto por volume fica VISÍVEL para o
-- cliente (o R$/envio despenca), e o total no topo continua acessível.
--
-- Curva (linear no TOTAL, decrescente no R$/envio):
--   total_centavos(n) = round( preco_centavos
--                              + (preco_max_centavos - preco_centavos)
--                                * (n - envios_min) / (envios_max - envios_min) )
--   r$/envio(n) = total_centavos(n) / n   (só exibição)
-- Com os valores do Plus abaixo (3000..7990, 16..200):
--   16 envios  -> R$ 30,00  (R$ 1,88/envio)
--   50 envios  -> R$ 39,21  (R$ 0,78/envio)
--  100 envios  -> R$ 52,78  (R$ 0,53/envio)
--  200 envios  -> R$ 79,90  (R$ 0,40/envio)
-- O piso é 16 porque o plano acima (Profissional) cobre até 15 envios.
--
-- Regras de ouro: dinheiro em centavos; catálogo em migration upsert idempotente
-- (chega ao cloud via `supabase db push`); sem DELETE de negócio (só UPDATE do
-- catálogo). Numeração: última = 0044; esta é 0045.
--
-- DECISÃO DE LIMITE (sem recriar a função SQL, p/ menor risco no cloud): o Plus
-- mantém `por_unidade = true` SÓ para reaproveitar a aritmética já existente em
-- `alavancas_do_plano` (capacidade = agenda_por_unidade * unidades; vagas =
-- ativaveis_por_unidade * unidades). Zerando os "por_unidade" para 1, a capacidade
-- da agenda e as vagas de ativo passam a ser 1:1 com os envios contratados
-- (`unidades` guarda o nº de envios escolhido). O flag NOVO `por_envio` é quem
-- governa PREÇO e UI; `por_unidade` vira detalhe interno da conta de capacidade.

-- 1. Colunas da curva de preço por envio (catálogo; lidas em runtime).
alter table public.planos add column if not exists por_envio boolean not null default false;
alter table public.planos add column if not exists envios_min integer;
alter table public.planos add column if not exists envios_max integer;
-- Total (em centavos) no topo da faixa (`envios_max`). `preco_centavos` continua
-- sendo o total no piso (`envios_min`).
alter table public.planos add column if not exists preco_max_centavos integer;

-- 2. Plus: ativa o modelo por envio e fixa a curva. Mantém `por_unidade = true`
--    com 1 de agenda + 1 ativável por "unidade" (= por envio), para a capacidade
--    e as vagas escalarem 1:1 com os envios via a função SQL já existente.
update public.planos
   set por_envio = true,
       envios_min = 16,
       envios_max = 200,
       preco_centavos = 3000,       -- total no piso (16 envios): R$ 30,00
       preco_max_centavos = 7990,   -- total no topo (200 envios): R$ 79,90
       agenda_por_unidade = 1,
       ativaveis_por_unidade = 1,
       por_unidade = true
 where id = 'plus';

-- 3. Os demais planos não são por envio (defesa explícita; default já é false).
update public.planos set por_envio = false where id in ('free', 'start', 'profissional');
