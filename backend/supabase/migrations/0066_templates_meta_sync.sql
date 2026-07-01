-- Submissão de template à Meta + status REAL refletido (fim do "aprovar" manual).
--
-- Até aqui o painel "aprovava" um template só ligando status_meta='aprovado' no banco
-- (resíduo da era Baileys, que não tinha aprovação de template). Com a Meta Cloud API o
-- fluxo correto é: o painel SUBMETE o template (a api enfileira; o zap cria/edita na WABA
-- via Graph) e o status_meta passa a refletir o veredito REAL da Meta (pendente em análise,
-- aprovado/rejeitado com motivo). Esta migration dá à tabela `templates` as colunas desse
-- ciclo e o grant mínimo para o zap escrever o status de volta.
--
-- Integração api<->zap segue a regra do projeto: só pelo banco (outbox), nunca import. A api
-- marca meta_acao='criar'; o zap drena (claim FOR UPDATE SKIP LOCKED em sincronizar_templates),
-- chama a Graph e grava meta_template_id/meta_submetido_em/status_meta/meta_motivo. O webhook
-- message_template_status_update e o reconcile periódico (GET message_templates) atualizam o
-- status_meta. As credenciais META_* vivem só no zap.
--
-- Numeração: última migration = 0065 (whats_teste); esta é a 0066.

alter table public.templates
  -- Categoria exigida pela Meta no create (UTILITY p/ quase tudo; AUTHENTICATION é o OTP,
  -- registrado à parte com formato fixo; MARKETING não é usado hoje mas fica permitido).
  add column if not exists categoria text not null default 'UTILITY'
    constraint templates_categoria_valida check (categoria in ('UTILITY', 'AUTHENTICATION', 'MARKETING')),
  -- Id do template na Meta: casa o webhook/reconcile e permite EDIT de versão futura.
  add column if not exists meta_template_id text,
  -- Quando foi submetido à Meta (null = rascunho, nunca submetido).
  add column if not exists meta_submetido_em timestamptz,
  -- Motivo da recusa devolvido pela Meta (mostrado ao owner no painel).
  add column if not exists meta_motivo text,
  -- Outbox simples: 'criar' = a api pediu submissão; o zap consome e zera. null = nada pendente.
  add column if not exists meta_acao text
    constraint templates_meta_acao_valida check (meta_acao is null or meta_acao in ('criar')),
  -- Amostras por variável (var -> exemplo) p/ o `example` do create na Meta (placeholder
  -- cru pode ser recusado). Preenchido pelo painel ao propor a versão.
  add column if not exists exemplos jsonb not null default '{}'::jsonb;

-- Índice parcial p/ o claim do drainer (poucas linhas; só as que têm ação pendente).
create index if not exists idx_templates_meta_acao on public.templates (meta_acao) where meta_acao is not null;

-- Grant mínimo: o zap (hoje só SELECT) passa a poder ESCREVER apenas as colunas de sync.
grant update (status_meta, meta_template_id, meta_submetido_em, meta_motivo, meta_acao)
  on public.templates to whaviso_zap;

-- RLS: além do select já existente (zap_templates_unif), uma policy de UPDATE para o zap.
-- O grant por coluna acima é quem limita O QUE o zap altera; esta policy libera as linhas.
create policy zap_templates_unif_update on public.templates for update to whaviso_zap
  using (true) with check (true);

-- Backfill aditivo (NÃO reseta status, p/ não quebrar o envio das mensagens já ativas nem os
-- testes que dependem delas): as linhas hoje 'aprovado' são tratadas como já submetidas. Para
-- valer de fato na Meta após a verificação da empresa, o owner re-submete cada uma pelo painel
-- (passa pelo fluxo real create/edit); o reconcile reflete o status real das que existirem na WABA.
update public.templates set meta_submetido_em = now() where status_meta = 'aprovado';
