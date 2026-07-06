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
-- seed). Nos testes, o drainer do CICLO (tabela `envios`) só envia template aprovado;
-- aprovamos aqui SÓ os templates do ciclo para exercitar o caminho de envio.
-- Escopo restrito a 'ciclo.%' de propósito: as notificações (tabela `notificacoes_cobrador`)
-- são drenadas GLOBALMENTE, então aprovar `cobrador.*`/`devedor.*` aqui faria uma notificação
-- residual de um teste virar enviável e poluir o dreno de outro (ex.: o gating do
-- notificar_cobrador). Os testes de notificação aprovam o template que precisam no próprio
-- setup, de forma local e revertida no fim (ver cadastro_pix_e14 / notificar_*).
update public.templates set status_meta = 'aprovado' where ativo and chave like 'ciclo.%' and status_meta <> 'aprovado';
