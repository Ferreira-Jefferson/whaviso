-- E2 — H2.5/H2.6/H2.7: TEMPLATES das mensagens ao DEVEDOR (pausa/reativa/cancela/
-- edição a aprovar) e ao COBRADOR (edição recusada pelo devedor). Catálogo via
-- migration UPSERT (padrão 0029, NÃO seed — o cloud não roda seed).
--
-- O alvo dessas mensagens é o DEVEDOR (quem recebe os lembretes), por isso a família
-- de chaves é `devedor.*` (distinta de `cobrador.*` da 0029, que notifica o criador).
-- A única exceção é `cobrador.edicao_recusada`: quando o devedor RECUSA a edição, quem
-- é avisado é o COBRADOR (criador), reusando o caminho de notificação ao criador.
--
-- Conteúdo: neutro de gênero, sem palavras proibidas (CHECK templates_conteudo_
-- linguagem_limpa), SEM travessão (CHECK de travessão), identificando o combinado por
-- {{...codigo...}} e o motivo por {{...motivo...}}. Nascem 'pendente'+inativos: o
-- drainer mostra ao owner "sem_template_ativo" até o owner ativar a versão (H12.8).
--
-- Variáveis (resolvidas pela ordem em `variaveis`): {{1}}=alvo (saudação),
-- {{2}}=codigo do combinado, {{3}}=motivo. A 2ª msg do Pix (titular/banco, E7 H7.3)
-- NÃO é deste épico.
--
-- Numeração: última = 0033; esta é 0034.

-- H2.7 pausa: o devedor soube que os lembretes ficaram suspensos.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'devedor.aviso_pausado', 'padrao', 'whaviso_devedor_aviso_pausado', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. Os lembretes do combinado {{2}} ({{3}}) foram pausados. Enquanto isso, você não vai receber novos lembretes deste combinado. 🙂'),
       '["alvo","codigo","motivo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'devedor.aviso_pausado' and contexto = 'padrao');

-- H2.7 reativação: voltou ao ciclo.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'devedor.aviso_reativado', 'padrao', 'whaviso_devedor_aviso_reativado', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. Os lembretes do combinado {{2}} ({{3}}) foram reativados. 🙂'),
       '["alvo","codigo","motivo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'devedor.aviso_reativado' and contexto = 'padrao');

-- H2.6 cancelamento (só vai ao devedor quando o combinado JÁ tinha sido aceito).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'devedor.aviso_cancelado', 'padrao', 'whaviso_devedor_aviso_cancelado', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. O combinado {{2}} ({{3}}) foi cancelado. Você não vai mais receber lembretes deste combinado. 🙂'),
       '["alvo","codigo","motivo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'devedor.aviso_cancelado' and contexto = 'padrao');

-- H2.5 edição a aprovar: a mensagem precisa dizer AS DUAS coisas (G-M4): há uma
-- alteração a aprovar E os lembretes ficam pausados até a decisão.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'devedor.aviso_edicao_a_aprovar', 'padrao', 'whaviso_devedor_aviso_edicao_a_aprovar', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. O combinado {{2}} ({{3}}) teve uma alteração que precisa da sua aprovação. Até você decidir, os lembretes deste combinado ficam pausados. 🙂'),
       '["alvo","codigo","motivo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'devedor.aviso_edicao_a_aprovar' and contexto = 'padrao');

-- H2.5 edição recusada pelo devedor: quem é avisado é o COBRADOR (criador), que
-- escolhe reativar nas condições anteriores ou reeditar (família cobrador.*).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'cobrador.edicao_recusada', 'padrao', 'whaviso_cobrador_edicao_recusada', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. A alteração que você propôs no combinado {{2}} ({{3}}) foi recusada. Você pode reativar nas condições anteriores ou editar de novo. 🙂'),
       '["alvo","codigo","motivo"]'::jsonb, 'pendente', false
where not exists (select 1 from public.templates where chave = 'cobrador.edicao_recusada' and contexto = 'padrao');
