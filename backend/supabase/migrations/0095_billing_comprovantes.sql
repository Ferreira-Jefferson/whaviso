-- Item 19 (leva 2026-07-22 1D): comprovante de recarga validado por IA antes de creditar
-- automaticamente (H11.10 estendida, ver historias/11-planos-billing.md H11.14). O usuário
-- anexa o comprovante da recarga (foto/PDF) na tela de Créditos; o servidor guarda o arquivo
-- no Supabase Storage (bucket privado "comprovantes", criado à parte no painel/cloud: este
-- schema não cria bucket, só a tabela de negócio) e chama um validador com visão (OpenRouter)
-- para conferir se é um comprovante de pagamento válido e se o valor bate com a recarga.
--
-- Alta confiança + valor batendo: credita automaticamente (reaproveita creditarEnvios,
-- tipo 'compra', já previsto na 0057). Confiança baixa (ou IA indisponível, ou valor não
-- bate com clareza): NÃO credita nem rejeita sozinho, fica 'aguardando_revisao_manual' até
-- o owner decidir (H11.11, mesmo padrão de "owner credita com confirmação").
--
-- 1 comprovante ativo por recarga (unique em recarga_id); reenviar sobrescreve enquanto o
-- status ainda não é terminal (aprovado/rejeitado), guardado pela api, não pelo banco.
--
-- Retenção do ARQUIVO (não do registro): 30 dias, depois apagado do Storage mantendo só a
-- decisão no banco (auditoria sem o documento). idx_..._retencao serve o job periódico; não
-- há infra de cron na api (só o zap tem scheduler, apps/zap/src/scheduler.ts, ex.: o job de
-- creditos_hold de 24h). Job de apagar o arquivo fica para uma leva futura no zap (nota em
-- backend/apps/api/src/modules/billing/MODULE.md).
--
-- Nunca logar o conteúdo do documento nem a resposta bruta da IA (dado bancário de terceiro
-- ou do próprio usuário). `ia_motivo` é só uma frase curta de classificação (ex.: "valor não
-- confere", "documento ilegível"), nunca dado extraído (conta/agência/CPF/chave Pix).
--
-- Numeração: última migration = 0094 (aviso_codigo); esta é 0095 (grupo 1D).

create table public.billing_comprovantes (
  id uuid primary key default gen_random_uuid(),
  recarga_id uuid not null unique references public.notificacoes_billing (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  arquivo_path text not null,   -- caminho no bucket "comprovantes" do Supabase Storage
  arquivo_mime text not null,
  status text not null default 'em_analise',
  ia_confianca numeric(4,3),    -- 0..1; null antes de a IA responder (ou se ficou indisponível)
  ia_valor_bate boolean,        -- a IA identificou o valor da recarga no comprovante?
  ia_motivo text,               -- frase curta de classificação; NUNCA dado bancário extraído
  revisado_por uuid references public.profiles (id),
  revisado_em timestamptz,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '30 days'),
  arquivo_apagado_em timestamptz,
  constraint billing_comprovantes_status_valido
    check (status in ('em_analise', 'aguardando_revisao_manual', 'aprovado', 'rejeitado')),
  constraint billing_comprovantes_confianca_faixa
    check (ia_confianca is null or (ia_confianca >= 0 and ia_confianca <= 1))
);

-- Fila de revisão manual do owner (listagem simples, H11.14).
create index idx_billing_comprovantes_revisao
  on public.billing_comprovantes (criado_em)
  where status = 'aguardando_revisao_manual';

-- Worklist do job de retenção de 30 dias (arquivo ainda não apagado e já vencido).
create index idx_billing_comprovantes_retencao
  on public.billing_comprovantes (expira_em)
  where arquivo_apagado_em is null;

-- Grants (padrão 0089: só a api; sem DELETE, negócio nunca some). zap não acessa esta
-- tabela hoje (o futuro job de retenção, se rodar no zap, ganha grant próprio quando existir).
grant select, insert, update on public.billing_comprovantes to whaviso_api;

alter table public.billing_comprovantes enable row level security;
create policy api_billing_comprovantes on public.billing_comprovantes
  for all to whaviso_api using (true) with check (true);
