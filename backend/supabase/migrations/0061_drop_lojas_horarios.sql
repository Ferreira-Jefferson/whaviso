-- Remove a coluna legada public.lojas.horarios (jsonb). A disponibilidade da loja passou a ter fonte
-- unica nas tabelas normalizadas horarios_funcionamento + excecoes_disponibilidade + agendamento_config
-- (regras-negocio/05, migrations 0024 e 0060). O motor do atendente ja migrou e a UI nao edita mais o
-- jsonb; `aberta_agora` agora e derivado de horarios_funcionamento + excecoes_disponibilidade pelo
-- kernel @whaviso/shared/disponibilidade. Nenhum consumidor restante le a coluna.
-- (if exists so por seguranca; a migration nao e idempotente por design.)
alter table public.lojas drop column if exists horarios;
