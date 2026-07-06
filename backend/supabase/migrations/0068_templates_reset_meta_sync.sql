-- Limpa aprovacoes FANTASMAS de template na Meta.
--
-- Contexto: a integracao com a Meta Cloud API foi (re)configurada num app/WABA de
-- PRODUCAO novo (app Whaviso, WABA 1551402953441650). Nenhum template do whaviso existe
-- de fato nessa WABA ainda (so o hello_world padrao). Porem, varias linhas de `templates`
-- estao com status_meta='aprovado' + meta_submetido_em preenchido: residuo do backfill da
-- 0066 e de testes manuais antigos (aprovacao setada no banco na era Baileys).
--
-- Isso e perigoso: os drains (enviar_lembretes / notificar_cobrador / notificar_billing)
-- so enviam template com status_meta='aprovado'. Com a aprovacao fantasma eles tentariam
-- enviar um template que a Meta NAO tem -> falha de envio. E o reconcile NAO rebaixa por
-- ausencia (proposital: a lista pode vir paginada e rebaixar em massa seria destrutivo),
-- entao esse estado nao se auto-corrige.
--
-- Solucao: zera o estado de sincronizacao de TODA linha que nao esteja no estado pristino
-- ('pendente', nunca submetido). Assim o painel volta a mostrar "Submeter a Meta" e, apos
-- o deploy, cada template e submetido DE VERDADE (o zap cria na WABA e a Meta decide o
-- status via webhook/reconcile). O painel nunca liga status_meta na mao.
--
-- Idempotente: reexecutar nao faz nada (o WHERE ja exclui o estado limpo). Nao muda schema
-- nem conteudo de mensagem, so o estado de aprovacao/submissao. Respostas de texto livre
-- (resposta.* / wizard) nao sao enviadas como template e ignoram status_meta: rebaixa-las
-- e apenas cosmetico no painel, sem efeito no envio.
--
-- A PROVA DE REPLAY: so mexe em linhas SEM meta_template_id. Uma aprovacao REAL da Meta
-- sempre tem o meta_template_id gravado pelo zap (o id que a Graph devolve ao criar o
-- template); as fantasmas tem esse campo nulo. Assim, mesmo que esta migration rodasse de
-- novo num banco que ja tenha aprovacoes de verdade (ex.: recriar o banco local do zero),
-- ela NUNCA revoga uma aprovacao real: passa longe de tudo que tem id da Meta.
--
-- Numeracao: ultima migration = 0067 (convite_auto_envio); esta e a 0068.

update public.templates
   set status_meta       = 'pendente'::status_meta_template,
       meta_submetido_em = null,
       meta_motivo       = null,
       meta_acao         = null
 where meta_template_id is null
   and ( status_meta <> 'pendente'
      or meta_submetido_em is not null
      or meta_motivo       is not null
      or meta_acao         is not null );
