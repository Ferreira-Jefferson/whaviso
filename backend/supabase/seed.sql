-- Seed de desenvolvimento. NÃO usar em produção (em prod, senhas vêm do dashboard).

-- Senhas dev dos roles de serviço (coincidem com .env.example).
alter role whaviso_api with password 'whaviso_api_dev';
alter role whaviso_zap with password 'whaviso_zap_dev';

-- Planos: o catálogo agora é UPSERT na migration 0019 (fonte única, chega ao
-- cloud/prod via db push). Não duplicar aqui.

-- Os templates do CICLO (lembretes D-2..D+1, padrão e revisão) agora vivem na
-- tabela unificada `templates` (chaves 'ciclo.<etapa>'), semeados pela migration
-- 0024 (catálogo em migration chega ao cloud via db push; o seed não roda lá).
-- O template de aviso ao COBRADOR ("pagamento informado") agora vive na tabela
-- unificada `templates` (chave 'cobrador.pagamento_informado'), semeado pela
-- migration 0023. Não há mais seed de templates_cobrador (tabela aposentada).

-- APENAS TESTE/DEV: em PRODUÇÃO o status/ativação real vem da Meta e este seed NÃO roda lá
-- (o db push pula o seed). Nos testes, TODO dreno do zap (envios, notificacoes_cobrador,
-- notificacoes_billing) e as réplicas na janela de 24h só usam template com ativo=true (e o
-- ciclo/notificações também exigem status_meta='aprovado'). As migrations recentes deixaram
-- o catálogo INATIVO/pendente de propósito para produção: a 0068 zerou aprovações fantasmas
-- da era Baileys, a 0072 reescreveu textos (re-submissão => pendente) e a 0073 rebaixou a
-- ativo=false tudo que não estava aprovado. Sem reativar aqui, a suíte inteira (e o gate de
-- testes do CI) fica vermelha porque nada é enviável.
--
-- Então, SÓ no dev/test, restauramos o catálogo para enviável (ativo + aprovado). É seguro:
-- cada teste limpa suas linhas de outbox pelo cascade de `limpar` (delete em auth.users ->
-- avisos -> notificacoes_cobrador), então uma notificação residual não vaza para o dreno de
-- outro teste, e nenhum teste depende de "template inativo => não envia".
update public.templates set ativo = true, status_meta = 'aprovado';
