-- 0056: ajuste da CAPACIDADE DE AGENDA dos planos pagos (E11, decisão do owner
-- 2026-06-25, ver historias/11-planos-billing.md). A agenda do Plus em 1:1 ficava menor
-- que Start/Profissional até uns 150 envios (sem sentido para o plano "para quem cresce"),
-- e o Profissional cabia poucas anotações. Ajuste:
--   profissional: capacidade_agenda 150 -> 250
--   plus:         agenda_por_unidade 1 -> 10  (agenda = 10 x envios contratados;
--                 ex.: 50 envios -> 500 anotações; 26 -> 260, acima do Profissional)
-- Free (25) e Start (100) inalterados. As VAGAS de aviso ativo do Plus seguem 1:1 com os
-- envios (ativaveis_por_unidade = 1); muda só a agenda (a conta anota muito mais do que
-- envia, coerente com o balde único).
--
-- Version-aware (igual à 0055, catálogo versionado da 0054): atualiza a oferta corrente
-- (planos), cria a versão NOVA de profissional/plus e avança `versao_corrente_id`; as
-- versões anteriores ficam preservadas (append-only) para assinaturas que já as fixaram
-- (H11.12). Regras de ouro: sem DELETE. Numeração: última = 0055; esta é 0056.

-- 1) Oferta corrente (planos).
update public.planos set capacidade_agenda = 250 where id = 'profissional';
update public.planos set agenda_por_unidade = 10 where id = 'plus';

-- 2) Nova versão (max+1) dos planos alterados, snapshot do estado atual de `planos`.
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
where p.id in ('profissional', 'plus');

-- 3) Avança a versão corrente dos 2 planos para a recém-criada (maior versao).
update public.planos p
   set versao_corrente_id = (
     select v.id from public.plano_versoes v
      where v.plano_id = p.id
      order by v.versao desc
      limit 1
   )
 where p.id in ('profissional', 'plus');
