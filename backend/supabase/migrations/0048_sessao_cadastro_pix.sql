-- E14: cadastro guiado da chave pix pelo COBRADOR no fluxo PAGAR INVERTIDO.
--
-- No invertido (criador = devedor que convida o cobrador) a chave passou a ser OPCIONAL
-- (0047). Falta o caminho para o cobrador informar a PRÓPRIA chave depois, de forma
-- estruturada (wizard pelo WhatsApp), e essa chave chegar ao devedor e ficar vinculada
-- ao combinado. Esta migration cria a SESSÃO conversacional do wizard (1a conversa
-- multi-etapa do projeto: o webhook era event-driven, sem memória entre mensagens),
-- os eventos de auditoria, os grants para o zap gravar a chave/snapshot, e os templates
-- novos (editáveis pelo owner, E12).
--
-- Numeração: última migration = 0047 (aviso_invertido_pix_opcional); esta é 0048.

-- 1) Eventos novos (auditoria, append-only): pedido do devedor e cadastro concluído.
alter type tipo_evento add value if not exists 'pix_solicitada';
alter type tipo_evento add value if not exists 'pix_cadastrada';

-- 2) Sessão do wizard de cadastro de chave. Estado parcial por etapa, amarrado ao
--    combinado que disparou o fluxo. `origem` distingue a oferta no aceite (Gatilho A,
--    que SEGURA a notificação de aceite ao devedor até o cobrador resolver a oferta) do
--    pedido do devedor (Gatilho B). Sem DELETE: o ciclo de vida muda o `status`.
create table public.sessao_cadastro_pix (
  id uuid primary key default gen_random_uuid(),
  -- Telefone do COBRADOR (quem informa a chave). Lookup da conversa no inbound.
  telefone text not null,
  aviso_id uuid not null references public.avisos (id) on delete cascade,
  origem text not null check (origem in ('aceite', 'pedido_devedor')),
  etapa text not null default 'oferta'
    check (etapa in ('oferta', 'titular', 'instituicao', 'chave', 'tipo', 'confirmacao')),
  titular text,
  instituicao text,
  chave text,
  tipo tipo_chave_pix,
  status text not null default 'ativa' check (status in ('ativa', 'concluida', 'cancelada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint sessao_pix_telefone_e164 check (telefone ~ '^\+[1-9][0-9]{9,14}$'),
  constraint sessao_pix_titular_tam check (titular is null or char_length(titular) <= 120),
  constraint sessao_pix_instituicao_tam check (instituicao is null or char_length(instituicao) <= 80),
  constraint sessao_pix_chave_tam check (chave is null or char_length(chave) <= 140)
);

-- No máximo UMA sessão ATIVA por telefone (uma conversa de wizard de cada vez).
create unique index sessao_cadastro_pix_ativa_unq
  on public.sessao_cadastro_pix (telefone) where status = 'ativa';
-- Lookup por combinado (expiração e fallback de aceite do Gatilho A).
create index sessao_cadastro_pix_aviso on public.sessao_cadastro_pix (aviso_id);

-- Reusa a função de 0002_profiles.sql para manter atualizado_em coerente (a inatividade
-- medida por atualizado_em é a base da expiração da sessão).
create trigger trg_sessao_cadastro_pix_atualizado_em
  before update on public.sessao_cadastro_pix
  for each row execute function public.tocar_atualizado_em();

-- 3) Grants + RLS (padrão 0008). O zap é dono da sessão (cria/lê/atualiza no webhook);
--    a api só lê (diagnóstico/painel). Sem DELETE (status muda).
grant select, insert, update on public.sessao_cadastro_pix to whaviso_zap;
grant select on public.sessao_cadastro_pix to whaviso_api;
alter table public.sessao_cadastro_pix enable row level security;
create policy zap_sessao_cadastro_pix on public.sessao_cadastro_pix for all to whaviso_zap using (true) with check (true);
create policy api_sessao_cadastro_pix on public.sessao_cadastro_pix for select to whaviso_api using (true);

-- 4) Finalização do wizard: o zap grava a chave no perfil do cobrador e o snapshot no
--    aviso. Até aqui chaves_pix só era acessada pela api (0012) e o zap só podia
--    update(status, aceito_em, atualizado_em) em avisos (0008). Sem DELETE.
grant select, insert, update on public.chaves_pix to whaviso_zap;
create policy zap_chaves_pix on public.chaves_pix for all to whaviso_zap using (true) with check (true);
grant update (pix_chave, pix_titular, pix_banco) on public.avisos to whaviso_zap;

-- 5) Templates novos (E12, editáveis pelo owner), ATIVOS para o transporte atual
--    (Baileys): status_meta='aprovado', ativo=true. Idempotentes (não recriam se já há a
--    chave no contexto padrão). Linguagem limpa (CHECK templates_unif_linguagem_limpa):
--    sem palavra proibida, sem travessão, neutra quanto a gênero.

-- Oferta ao cobrador (Gatilho A no aceite, Gatilho B a pedido do devedor). {{1}} = nome
-- de quem vai pagar (devedor).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'resposta.pix_oferecer', 'padrao', 'whaviso_resposta_pix_oferecer', 'pt_BR',
       jsonb_build_object(
         'texto', E'Combinado confirmado! 🙂 Quer informar sua chave pix agora? Ela fica vinculada a este combinado para {{1}} te pagar com mais agilidade.',
         'botoes', jsonb_build_array(
           jsonb_build_object('acao', 'informar_pix', 'rotulo', 'Informar chave'),
           jsonb_build_object('acao', 'pix_pular', 'rotulo', 'Agora não')
         )
       ),
       '["nome_devedor"]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.pix_oferecer' and contexto = 'padrao');

-- Etapa 1: titular (texto livre, sem botão de corrigir por ser a primeira etapa).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'pix.titular', 'padrao', 'whaviso_pix_titular', 'pt_BR',
       jsonb_build_object('texto', E'Vamos lá. Informe o nome do titular da chave pix.'),
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'pix.titular' and contexto = 'padrao');

-- Etapa 2: instituição (banco).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'pix.instituicao', 'padrao', 'whaviso_pix_instituicao', 'pt_BR',
       jsonb_build_object(
         'texto', E'Agora informe a instituição financeira (o banco) da chave.',
         'botoes', jsonb_build_array(jsonb_build_object('acao', 'pix_corrigir', 'rotulo', 'Corrigir anterior'))
       ),
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'pix.instituicao' and contexto = 'padrao');

-- Etapa 3: a chave em si.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'pix.chave', 'padrao', 'whaviso_pix_chave', 'pt_BR',
       jsonb_build_object(
         'texto', E'Agora informe a sua chave pix.',
         'botoes', jsonb_build_array(jsonb_build_object('acao', 'pix_corrigir', 'rotulo', 'Corrigir anterior'))
       ),
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'pix.chave' and contexto = 'padrao');

-- Etapa 4a: tipo inferido, confirmação por botão. {{1}} = rótulo do tipo detectado.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'pix.confirmar_tipo', 'padrao', 'whaviso_pix_confirmar_tipo', 'pt_BR',
       jsonb_build_object(
         'texto', E'Isto parece {{1}}. Confirma?',
         'botoes', jsonb_build_array(
           jsonb_build_object('acao', 'pix_confirma_tipo', 'rotulo', 'Confirmar'),
           jsonb_build_object('acao', 'pix_corrige_tipo', 'rotulo', 'Corrigir tipo')
         )
       ),
       '["tipo"]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'pix.confirmar_tipo' and contexto = 'padrao');

-- Etapa 4b: tipo por resposta numerada (fallback quando a detecção é ambígua, sem lista).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'pix.tipo_manual', 'padrao', 'whaviso_pix_tipo_manual', 'pt_BR',
       jsonb_build_object(
         'texto', E'Qual o tipo da chave? Responda com o número:\n1. CPF\n2. CNPJ\n3. E-mail\n4. Telefone\n5. Chave aleatória',
         'botoes', jsonb_build_array(jsonb_build_object('acao', 'pix_corrigir', 'rotulo', 'Corrigir anterior'))
       ),
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'pix.tipo_manual' and contexto = 'padrao');

-- Etapa 5: confirmação consolidada. {{1}} titular, {{2}} banco, {{3}} tipo, {{4}} chave.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'pix.confirmar', 'padrao', 'whaviso_pix_confirmar', 'pt_BR',
       jsonb_build_object(
         'texto', E'Confira os dados:\nTitular: {{1}}\nBanco: {{2}}\nTipo: {{3}}\nChave: {{4}}\n\nEstá tudo certo?',
         'botoes', jsonb_build_array(
           jsonb_build_object('acao', 'pix_confirmar', 'rotulo', 'Confirmar'),
           jsonb_build_object('acao', 'pix_corrigir', 'rotulo', 'Corrigir anterior')
         )
       ),
       '["titular","banco","tipo","chave"]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'pix.confirmar' and contexto = 'padrao');

-- Confirmação ao cobrador depois de salvar. {{1}} = nome de quem vai pagar (devedor).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'resposta.pix_salva', 'padrao', 'whaviso_resposta_pix_salva', 'pt_BR',
       jsonb_build_object('texto', E'Tudo certo! Sua chave foi salva e enviada para {{1}}. Obrigado! 🙂'),
       '["nome_devedor"]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.pix_salva' and contexto = 'padrao');

-- Cobrador escolheu "Agora não" na oferta.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'resposta.pix_pulado', 'padrao', 'whaviso_resposta_pix_pulado', 'pt_BR',
       jsonb_build_object('texto', E'Tudo bem! Você pode informar sua chave pix mais tarde.'),
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.pix_pulado' and contexto = 'padrao');

-- Resposta ao DEVEDOR quando ele toca "Solicitar chave pix" no lembrete.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'resposta.pix_solicitado_devedor', 'padrao', 'whaviso_resposta_pix_solicitado_devedor', 'pt_BR',
       jsonb_build_object('texto', E'Pronto! Vamos pedir a chave pix a quem vai receber. Assim que ela chegar, você recebe aqui.'),
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'resposta.pix_solicitado_devedor' and contexto = 'padrao');

-- Notificação ao DEVEDOR com a chave (família devedor.*, drenada pela outbox). {{1}} alvo,
-- {{2}} código do combinado, {{3}} quem recebe (cobrador), {{4}} chave, {{5}} titular, {{6}} banco.
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'devedor.pix_chave_recebida', 'padrao', 'whaviso_devedor_pix_chave_recebida', 'pt_BR',
       jsonb_build_object('texto',
         E'Oi, {{1}}. {{3}} confirmou o combinado {{2}} e enviou a chave pix.\nChave: {{4}}\nTitular: {{5}}\nBanco: {{6}}'),
       '["alvo","codigo","cobrador","pix_chave","pix_titular","pix_banco"]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'devedor.pix_chave_recebida' and contexto = 'padrao');

-- Rótulo do botão "Solicitar chave" injetado no lembrete ao devedor (no invertido sem
-- chave). Só o texto importa (usado como rótulo do botão em runtime).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'botao.solicitar_pix', 'padrao', 'whaviso_botao_solicitar_pix', 'pt_BR',
       jsonb_build_object('texto', E'Solicitar chave pix'),
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'botao.solicitar_pix' and contexto = 'padrao');
