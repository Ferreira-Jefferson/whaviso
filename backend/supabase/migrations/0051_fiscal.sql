-- API-fiscal: emissao de NFC-e/NFS-e por EMISSOR DE TERCEIRO (ClienteFiscal). Nao ha motor fiscal
-- por UF aqui: guardamos a configuracao da loja junto ao emissor e a referencia de cada documento
-- (status, chave, link). O provedor do emissor e decisao do dono do produto (ainda nao escolhido).
--
--   fiscal_config       uma linha por loja: credencial do emissor CIFRADA (write-only para a
--                       tela; a api decifra so ao chamar o emissor, mesmo molde de
--                       numeros_whatsapp.token_cifrado), regime tributario, series, ambiente.
--   documentos_fiscais  um documento por (pedido, tipo). pendente -> emitido | erro. Tentar de
--                       novo apos erro reaproveita a mesma linha (sem DELETE: negocio nao some).

create table public.fiscal_config (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  credencial_cifrada bytea not null,         -- cifra da aplicacao; master key fora do banco
  ultimos4 text,                             -- so para exibir "configurada (...1234)"
  cnpj text not null,                        -- 14 digitos, so numeros
  regime text not null,
  serie_nfce integer not null default 1,
  serie_nfse integer not null default 1,
  ambiente text not null default 'homologacao',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fiscal_config_regime check (regime in ('mei', 'simples_nacional', 'lucro_presumido', 'lucro_real')),
  constraint fiscal_config_ambiente check (ambiente in ('homologacao', 'producao')),
  constraint fiscal_config_cnpj check (cnpj ~ '^[0-9]{14}$'),
  constraint fiscal_config_series check (serie_nfce between 1 and 999 and serie_nfse between 1 and 999),
  constraint fiscal_config_ultimos4 check (ultimos4 is null or ultimos4 ~ '^[0-9A-Za-z]{2,8}$')
);
create unique index fiscal_config_loja on public.fiscal_config (loja_id);

create trigger trg_fiscal_config_atualizado_em before update on public.fiscal_config
  for each row execute function public.tocar_atualizado_em();

alter table public.fiscal_config enable row level security;

-- api: escreve e le a configuracao (a credencial cifrada e lida so para decifrar na chamada ao
-- emissor, como numeros_whatsapp). Sem DELETE: desativar = ativo=false.
grant select, insert on public.fiscal_config to whaviso_api;
grant update (credencial_cifrada, ultimos4, cnpj, regime, serie_nfce, serie_nfse, ambiente, ativo)
  on public.fiscal_config to whaviso_api;
create policy api_fiscal_config on public.fiscal_config
  for all to whaviso_api using (true) with check (true);

create table public.documentos_fiscais (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  pedido_id uuid not null references public.pedidos (id),
  tipo text not null,
  status text not null default 'pendente',
  chave text,                                -- chave de acesso / identificador no emissor
  link text,                                 -- URL do documento (DANFE/PDF/consulta), https
  erro text,                                 -- motivo curto (sem PII, sem segredo)
  valor_total_centavos integer not null,     -- snapshot do total do pedido na emissao
  tentativas integer not null default 1,
  emitido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint documentos_fiscais_tipo check (tipo in ('nfce', 'nfse')),
  constraint documentos_fiscais_status check (status in ('pendente', 'emitido', 'erro')),
  constraint documentos_fiscais_valor check (valor_total_centavos >= 0),
  constraint documentos_fiscais_emitido_tem_chave check (status <> 'emitido' or (chave is not null and emitido_em is not null)),
  constraint documentos_fiscais_chave_tam check (chave is null or char_length(chave) between 1 and 120),
  constraint documentos_fiscais_link_https check (link is null or (link ~ '^https://' and char_length(link) <= 2048)),
  constraint documentos_fiscais_erro_tam check (erro is null or char_length(erro) <= 500)
);
-- Um documento por pedido e tipo (idempotencia da emissao; corrida resolvida no banco).
create unique index documentos_fiscais_pedido_tipo on public.documentos_fiscais (pedido_id, tipo);
create index documentos_fiscais_loja_recentes on public.documentos_fiscais (loja_id, criado_em desc, id desc);
create index documentos_fiscais_loja_status on public.documentos_fiscais (loja_id, status);

create trigger trg_documentos_fiscais_atualizado_em before update on public.documentos_fiscais
  for each row execute function public.tocar_atualizado_em();

alter table public.documentos_fiscais enable row level security;

-- api: cria e atualiza o resultado da emissao. Sem DELETE (auditoria fiscal nao some).
grant select, insert on public.documentos_fiscais to whaviso_api;
grant update (status, chave, link, erro, tentativas, emitido_em)
  on public.documentos_fiscais to whaviso_api;
create policy api_documentos_fiscais on public.documentos_fiscais
  for all to whaviso_api using (true) with check (true);
