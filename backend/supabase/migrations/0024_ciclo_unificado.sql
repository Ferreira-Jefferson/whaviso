-- Migra a família CICLO (lembretes D-2..D+1) para a tabela unificada `templates`
-- e aposenta `templates_mensagem`. Passo 3 (e último) da consolidação dos
-- templates. O ciclo passa a ser lido pelo zap por chave ('ciclo.<etapa>', com
-- contexto padrao/revisao) e editado pela MESMA tela (/admin/mensagens/:chave),
-- agora com os BOTÕES vindos do próprio template (não mais fixos no código).
--
-- Os botões do ciclo (uniformes em todas as etapas) entram em `conteudo.botoes`.
-- O "Ver chave Pix" é suprimido no envio quando o aviso não tem chave (decisão de
-- negócio, no zap), mas o template declara os três.

-- Botões padrão do ciclo (rótulos atuais do código, render.ts). 'acao' é
-- comportamento (conhecido pelo zap/webhook); 'rotulo' é editável no painel.
-- 1. Copia o que existir em templates_mensagem (no cloud traz as versões reais,
--    inclusive propostas; em banco novo a tabela está vazia, pois o seed roda depois).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, versao, status_meta, ativo, criado_em)
select 'ciclo.' || tm.etapa::text, tm.contexto, tm.nome_meta, tm.idioma,
       jsonb_build_object(
         'texto', tm.corpo,
         'botoes', jsonb_build_array(
           jsonb_build_object('acao', 'ja_paguei', 'rotulo', 'Já paguei'),
           jsonb_build_object('acao', 'ver_pix', 'rotulo', 'Ver chave Pix'),
           jsonb_build_object('acao', 'optout', 'rotulo', 'Não quero mais lembretes')
         )
       ),
       tm.variaveis, tm.versao, tm.status_meta, tm.ativo, tm.criado_em
from public.templates_mensagem tm;

-- 2. Catálogo padrão (banco novo, onde a cópia não trouxe nada). Não duplica se a
--    versão já veio do passo 1. Padrão: aprovado+ativo; revisao: pendente+inativo (gated).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, versao, status_meta, ativo)
select d.chave, d.contexto::template_contexto, d.nome_meta, 'pt_BR',
       jsonb_build_object(
         'texto', d.corpo,
         'botoes', jsonb_build_array(
           jsonb_build_object('acao', 'ja_paguei', 'rotulo', 'Já paguei'),
           jsonb_build_object('acao', 'ver_pix', 'rotulo', 'Ver chave Pix'),
           jsonb_build_object('acao', 'optout', 'rotulo', 'Não quero mais lembretes')
         )
       ),
       d.variaveis, d.versao, d.status_meta::status_meta_template, d.ativo
from (values
  ('ciclo.d_menos_2', 'padrao', 'whaviso_d2_antecipado',
   E'Oi, {{1}}. {{2}} pediu pra te lembrar do combinado: {{3}}, {{4}} para {{5}}.',
   '["nome_devedor","cobrador","motivo","valor","data"]'::jsonb, 2, 'aprovado', true),
  ('ciclo.d_menos_1', 'padrao', 'whaviso_d1_vespera',
   E'Oi, {{1}}. Amanhã é o dia: {{2}}, {{3}}.',
   '["nome_devedor","motivo","valor"]'::jsonb, 1, 'aprovado', true),
  ('ciclo.d', 'padrao', 'whaviso_d0_confirmacao',
   E'Oi, {{1}}. Hoje é o dia: {{2}}, {{3}}.',
   '["nome_devedor","motivo","valor"]'::jsonb, 2, 'aprovado', true),
  ('ciclo.d_mais_1', 'padrao', 'whaviso_d1_encerramento',
   E'Oi, {{1}}. Último aviso: {{2}}, {{3}}.',
   '["nome_devedor","motivo","valor"]'::jsonb, 2, 'aprovado', true),
  ('ciclo.d', 'revisao', 'whaviso_d0_revisao',
   E'Oi, {{1}}. Hoje é o dia: {{2}}, {{3}}. Se você já pagou, pode desconsiderar este aviso. 🙂',
   '["nome_devedor","motivo","valor"]'::jsonb, 1, 'pendente', false),
  ('ciclo.d_mais_1', 'revisao', 'whaviso_d1_revisao',
   E'Oi, {{1}}. Último aviso: {{2}}, {{3}}. Se você já pagou, pode desconsiderar. 🙂',
   '["nome_devedor","motivo","valor"]'::jsonb, 1, 'pendente', false)
) as d(chave, contexto, nome_meta, corpo, variaveis, versao, status_meta, ativo)
where not exists (
  -- só semeia o default quando a cópia (passo 1) não trouxe nada para esta
  -- (chave, contexto); evita um segundo ativo na mesma chave (unique index).
  select 1 from public.templates t where t.chave = d.chave and t.contexto = d.contexto::template_contexto
);

-- 3. Aposenta a tabela antiga (já migrada). A api e o zap passam a usar a unificada.
drop table public.templates_mensagem;
