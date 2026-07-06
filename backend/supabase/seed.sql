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

-- APENAS TESTE/DEV: as migrations entregam os templates com status_meta='pendente'
-- (a 0068 zerou as aprovações fantasmas da era Baileys; a aprovação real agora vem
-- da Meta). Em PRODUÇÃO isso é o correto, e este seed NÃO roda lá (o db push pula o
-- seed). Nos testes, porém, o drainer só envia template aprovado; aprovamos aqui os
-- templates ativos para exercitar o caminho de envio. Os testes que verificam o gating
-- de template não-aprovado (notificar_cobrador / notificar_billing) definem o
-- status_meta que precisam no próprio setup, então não dependem deste default.
update public.templates set status_meta = 'aprovado' where ativo and status_meta <> 'aprovado';
