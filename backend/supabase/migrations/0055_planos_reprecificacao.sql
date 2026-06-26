-- 0055: REPRECIFICAÇÃO deliberada do owner (E11, decisão 2026-06-25, ver
-- historias/11-planos-billing.md). Renumerada de uma 0052 que colidia com
-- 0052_recorrencia_ocorrencias. Depende de 0053 (permite_recorrente já = true em todos) e
-- de 0054 (catálogo VERSIONADO): por isso é VERSION-AWARE, fazendo o mesmo que o PATCH
-- /admin/planos (admin/index.ts): cria a versão NOVA dos planos alterados e avança
-- `versao_corrente_id`. A versão 1 (preços antigos) fica preservada (append-only) para as
-- assinaturas pagas que já a fixaram (H11.12); o free (pin null) acompanha a corrente.
--
-- Conserto da escada de preço: o R$/envio só pode CAIR conforme se sobe de plano. Antes o
-- Profissional custava R$ 1,196/envio (2990/25), MAIS CARO por envio que o Start (0,990):
-- inversão. Conserto:
--   profissional: 2990 -> 2390   (R$ 23,90; 0,956/envio, abaixo do Start)
--   plus piso:    3110 -> 2400   (R$ 24,00 em 26 envios; 0,923/envio)
--   plus topo:    14000 mantido  (R$ 140,00 em 200 envios; 0,70/envio = piso de margem)
--   free agenda:  50 -> 25       (amostra mais enxuta; o free acompanha a versão corrente)
-- Escada do R$/envio: 0,990 > 0,956 > 0,923 ... 0,700. Regra de margem: no mínimo
-- R$ 0,70/envio (custo R$ 0,53; lucro mínimo R$ 0,17/envio no pior caso).
--
-- Limites de Profissional/Plus NÃO mudam (só o preço); a única mudança de limite é a agenda
-- do Free, que acompanha a corrente por decisão. Regras de ouro: dinheiro em centavos; sem
-- DELETE (catálogo append-only). Numeração: última = 0054; esta é 0055.

-- 1) Oferta corrente (planos): novos preços e a agenda do Free.
update public.planos set preco_centavos = 2390 where id = 'profissional';
update public.planos set preco_centavos = 2400 where id = 'plus';
update public.planos set capacidade_agenda = 25 where id = 'free';

-- 2) Nova versão (max+1) dos planos alterados, snapshot do estado atual de `planos`
--    (espelha as colunas de public.plano_versoes seedadas na 0054).
insert into public.plano_versoes (
  plano_id, versao, nome, preco_centavos, max_avisos_ativos, permite_recorrente,
  capacidade_agenda, vagas_ativas, cadencia_configuravel, menu_texto_livre,
  informado_pago_habilitado, totais_periodo, por_unidade, agenda_por_unidade,
  ativaveis_por_unidade, reengajamento_max, edicoes_max, somente_leitura,
  por_envio, envios_min, envios_max, preco_max_centavos
)
select
  p.id,
  (select coalesce(max(v.versao), 0) + 1 from public.plano_versoes v where v.plano_id = p.id),
  p.nome, p.preco_centavos, p.max_avisos_ativos, p.permite_recorrente,
  p.capacidade_agenda, p.vagas_ativas, p.cadencia_configuravel, p.menu_texto_livre,
  p.informado_pago_habilitado, p.totais_periodo, p.por_unidade, p.agenda_por_unidade,
  p.ativaveis_por_unidade, p.reengajamento_max, p.edicoes_max, p.somente_leitura,
  p.por_envio, p.envios_min, p.envios_max, p.preco_max_centavos
from public.planos p
where p.id in ('free', 'profissional', 'plus');

-- 3) Avança a versão corrente dos 3 planos para a recém-criada (maior versao).
update public.planos p
   set versao_corrente_id = (
     select v.id from public.plano_versoes v
      where v.plano_id = p.id
      order by v.versao desc
      limit 1
   )
 where p.id in ('free', 'profissional', 'plus');
