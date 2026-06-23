-- E5 (Convite & Aceite pelo WhatsApp) — o aceite passa a ser 100% pelo WhatsApp.
--
-- O que este épico fecha no banco (a maquinaria de estados/eventos/outbox já veio de
-- F-STATE/E2/E3/E10a; aqui só o que é ESPECÍFICO da validação por número+telefone no
-- WhatsApp e do anti-brute-force):
--
--  1) EXPIRAÇÃO FIXA DE 7 DIAS do convite (H5.7): coluna `convite_expira_em` na `avisos`,
--     preenchida na criação/ativação com now()+7d (não varia por plano, diferente do
--     `aceite_token_expira_em`, que derivava de data_combinada). O sweep do zap passa a
--     usar esta coluna para expirar SÓ os `aguardando_aceite`.
--
--  2) ANTI-BRUTE-FORCE POR TELEFONE (H5.1/H5.9): tabela `convite_tentativas_telefone`
--     (estado mutável de rate-limit, NÃO auditoria). Conta erros de número por telefone
--     do remetente (não por aviso: quem digita um número que não bate com NENHUM convite
--     não tem aviso a que associar). NÃO guarda o número tentado, só o contador e o
--     bloqueio. Reset por UPDATE (sem DELETE). A coluna `avisos.convite_tentativas` (0030)
--     era por-aviso (estrutura reservada pelo E2); o E5 conta por TELEFONE, então usa
--     esta tabela; a coluna por-aviso fica sem produtor (documentado, não removida).
--
--  3) GRANTS ao `whaviso_zap` para regenerar o número (H5.9) e mexer no contador.
--
--  4) TEMPLATES `convite.*` voltados ao CONVIDADO (resumo + botões, pedir número,
--     expirado, já respondido, divergência, bloqueio). Nascem ATIVOS: é o texto vigente
--     que o Baileys envia (família espelha `resposta.*`, 0022). Catálogo via MIGRATION
--     (o seed não roda no cloud). Os textos seguem as invariantes (gênero neutro, sem
--     palavra proibida, sem travessão).
--
-- Numeração: última migration = 0036 (aviso_agenda_destino); esta é 0037.

-- ---------------------------------------------------------------------------------------
-- 1) Expiração fixa de 7 dias do convite.
-- ---------------------------------------------------------------------------------------
alter table public.avisos add column if not exists convite_expira_em timestamptz;

-- ---------------------------------------------------------------------------------------
-- 2) Contador anti-brute-force POR TELEFONE (estado de rate-limit, não auditoria).
--    erros: nº de números errados consecutivos; bloqueado: telefone não cadastrado que
--    estourou 3 erros (fica bloqueado até um novo combinado ser criado para ele).
-- ---------------------------------------------------------------------------------------
create table if not exists public.convite_tentativas_telefone (
  telefone      text primary key check (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  erros         integer not null default 0 check (erros >= 0),
  bloqueado     boolean not null default false,
  atualizado_em timestamptz not null default now()
);

comment on table public.convite_tentativas_telefone is
  'E5/H5.9: rate-limit do número de convite por telefone do remetente (estado mutável, sem PII além do telefone E.164; nunca guarda o número tentado).';

-- ---------------------------------------------------------------------------------------
-- 3) Grants. O zap precisa, além de (status, aceito_em, atualizado_em) já concedidos
--    em 0008, atualizar o número do convite (regeneração H5.9) e a expiração; vincular o
--    profile do convidado no aceite (H5.3: devedor_profile_id no receber, cobrador_id no
--    invertido); e ter acesso pleno ao contador por telefone (sem DELETE: reset por UPDATE).
-- ---------------------------------------------------------------------------------------
grant update (status, aceito_em, atualizado_em, convite_hash, convite_expira_em, convite_tentativas,
              devedor_profile_id, cobrador_id)
  on public.avisos to whaviso_zap;

grant select, insert, update on public.convite_tentativas_telefone to whaviso_zap;
-- a api limpa o bloqueio do telefone-alvo ao criar/ativar um novo combinado (G4).
grant select, insert, update on public.convite_tentativas_telefone to whaviso_api;

-- RLS deny-all para anon/authenticated; policies só para os roles de serviço.
alter table public.convite_tentativas_telefone enable row level security;
create policy zap_convite_tentativas on public.convite_tentativas_telefone
  for all to whaviso_zap using (true) with check (true);
create policy api_convite_tentativas on public.convite_tentativas_telefone
  for all to whaviso_api using (true) with check (true);

-- ---------------------------------------------------------------------------------------
-- 4) Templates voltados ao CONVIDADO (família convite.*). Nascem ATIVOS (texto vigente
--    do Baileys). Botões com rótulos EDITÁVEIS pelo owner (E12); o id do botão (acao) é
--    fixo no código (aceite/dado_incorreto/recusa). Variáveis do resumo identificam o
--    combinado SEM expor token/telefone: {{1}}=quem cobra, {{2}}=quem paga, {{3}}=motivo,
--    {{4}}=valor, {{5}}=data; no invertido a chave Pix entra como {{6}} (variante revisao).
-- ---------------------------------------------------------------------------------------

-- 4.1) Resumo + 3 botões — variante 'padrao' (fluxo receber: convidado é o devedor).
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'convite.resumo', 'padrao', 'whaviso_convite_resumo', 'pt_BR',
       jsonb_build_object(
         'texto',
           E'Encontrei seu combinado no Whaviso:\n\nQuem vai receber: {{1}}\nQuem vai pagar: {{2}}\nMotivo: {{3}}\nValor: {{4}}\nData combinada: {{5}}\n\nComo deseja responder?',
         'botoes', jsonb_build_array(
           jsonb_build_object('acao','aceite','rotulo','Aceitar'),
           jsonb_build_object('acao','dado_incorreto','rotulo','Algum dado está incorreto'),
           jsonb_build_object('acao','recusa','rotulo','Recusar combinado')
         )
       ),
       '["nome_cobrador","nome_devedor","motivo","valor","data"]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'convite.resumo' and contexto = 'padrao');

-- 4.2) Resumo + 3 botões — variante 'revisao' (fluxo invertido: convidado é o cobrador,
--      confere a chave Pix). Rótulo do botão de sinal vira "Chave Pix incorreta".
insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'convite.resumo', 'revisao', 'whaviso_convite_resumo_pix', 'pt_BR',
       jsonb_build_object(
         'texto',
           E'Encontrei seu combinado no Whaviso:\n\nQuem vai receber: {{1}}\nQuem vai pagar: {{2}}\nMotivo: {{3}}\nValor: {{4}}\nData combinada: {{5}}\nChave Pix para conferir: {{6}}\n\nComo deseja responder?',
         'botoes', jsonb_build_array(
           jsonb_build_object('acao','aceite','rotulo','Aceitar'),
           jsonb_build_object('acao','dado_incorreto','rotulo','Chave Pix incorreta'),
           jsonb_build_object('acao','recusa','rotulo','Recusar combinado')
         )
       ),
       '["nome_cobrador","nome_devedor","motivo","valor","data","pix_chave"]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'convite.resumo' and contexto = 'revisao');

-- 4.3) Pedir o número (mensagem inicial sem número — H5.1 fallback).
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'convite.pedir_numero', 'whaviso_convite_pedir_numero',
       '{"texto":"Olá! Para localizar seu combinado, me envie o número de convite (6 dígitos). Sem ele não consigo encontrar. 🙂"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'convite.pedir_numero' and contexto = 'padrao');

-- 4.4) Número não encontrado (H5.1: conta a tentativa; texto não revela nada).
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'convite.nao_encontrado', 'whaviso_convite_nao_encontrado',
       '{"texto":"Não encontrei um combinado com esse número. Confira o número de convite (6 dígitos) e tente de novo. 🙂"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'convite.nao_encontrado' and contexto = 'padrao');

-- 4.5) Convite expirado (H5.7).
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'convite.expirado', 'whaviso_convite_expirado',
       '{"texto":"Este convite expirou. Peça um novo a quem te convidou. 🙂"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'convite.expirado' and contexto = 'padrao');

-- 4.6) Convite já respondido / combinado já ativo ou encerrado (H5.6/H5.7).
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'convite.ja_respondido', 'whaviso_convite_ja_respondido',
       '{"texto":"Este combinado já foi respondido e não precisa de nova ação. 🙂"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'convite.ja_respondido' and contexto = 'padrao');

-- 4.7) Telefone divergente — mensagem ao CONVIDADO (H5.8: não revela dados do combinado).
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'convite.telefone_divergente', 'whaviso_convite_telefone_divergente',
       '{"texto":"Provavelmente quem te convidou digitou seu WhatsApp errado, ou este convite era para outra pessoa. Vamos avisar quem convidou. Se o convite for para você, em breve chega um convite ajustado. 🙂"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'convite.telefone_divergente' and contexto = 'padrao');

-- 4.8) Tentativas esgotadas, telefone CADASTRADO (H5.9): orienta a aguardar o reenvio.
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'convite.tentativas_cadastrado', 'whaviso_convite_tentativas_cadastrado',
       '{"texto":"Tivemos dificuldade para localizar seu combinado. Avisamos quem te convidou para reenviar um convite atualizado. Aguarde a nova mensagem. 🙂"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'convite.tentativas_cadastrado' and contexto = 'padrao');

-- 4.9) Tentativas esgotadas, telefone NÃO cadastrado (H5.9): bloqueio, mensagem diferente,
--      sem revelar nada e sem notificar criador algum.
insert into public.templates (chave, nome_meta, conteudo, variaveis, status_meta, ativo)
select 'convite.bloqueado', 'whaviso_convite_bloqueado',
       '{"texto":"Não foi possível localizar um combinado para este número. Quando alguém te enviar um convite pelo Whaviso, é só responder com o número que vem na mensagem. 🙂"}'::jsonb,
       '[]'::jsonb, 'aprovado', true
where not exists (select 1 from public.templates where chave = 'convite.bloqueado' and contexto = 'padrao');
