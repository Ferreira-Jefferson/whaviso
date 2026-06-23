-- NOTA HISTÓRICA (E12): esta tabela foi UNIFICADA na tabela única `templates`
-- (0022) e DROPADA na 0024. NÃO é o estado vigente: toda mensagem hoje mora em
-- `public.templates` (por chave, conteúdo estruturado). Mantida só pelo histórico
-- da cadeia de migrations (aplicada antes do drop).
--
-- Espelho versionado dos templates aprovados na Meta. Dono: módulo `admin` da api; lido pelo zap no envio.

create table public.templates_mensagem (
  id uuid primary key default gen_random_uuid(),
  etapa etapa_envio not null,
  nome_meta text not null,
  idioma text not null default 'pt_BR',
  corpo text not null,
  variaveis jsonb not null default '[]'::jsonb,
  versao integer not null default 1,
  status_meta status_meta_template not null default 'pendente',
  ativo boolean not null default false,
  criado_em timestamptz not null default now(),
  constraint templates_versao_positiva check (versao > 0),
  -- Regra de ouro nº1 no banco: nenhum vocabulário proibido.
  -- Mantido em sincronia com PALAVRAS_PROIBIDAS_PATTERN em packages/shared/contracts/linguagem.ts.
  constraint templates_linguagem_limpa
    check (corpo !~* '(d[ií]vida|devendo|atras(o|ad)|cobran[çc]a|inadimpl)')
);

-- No máximo um template ativo por etapa.
create unique index idx_templates_ativo_por_etapa on public.templates_mensagem (etapa) where ativo;
create unique index idx_templates_nome_versao on public.templates_mensagem (nome_meta, versao);
