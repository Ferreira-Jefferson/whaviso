-- E11 (Planos): "totais por período" (consolidação do painel: somar a receber /
-- recebido / a pagar / pago num intervalo de datas) deixa de ser alavanca de plano e
-- passa a ser BASE, disponível em TODOS os planos. É table-stakes (consolidação da
-- informação), não diferencial; o backend nunca chegou a barrar isso por plano (a
-- flag só governava a exibição nos cartões). Sai da lista de vantagens dos planos.
--
-- A coluna `totais_periodo` permanece no catálogo (agora uniforme = true) para não
-- recriar a função SQL `alavancas_do_plano` nem mexer nos contratos; só o valor muda.
--
-- Regras de ouro: catálogo em migration upsert idempotente (chega ao cloud via
-- `supabase db push`). Numeração: última = 0049; esta é 0050.

update public.planos set totais_periodo = true;
