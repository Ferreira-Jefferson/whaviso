-- API-fiscal (item): dados fiscais por item do catalogo, necessarios para a SEFAZ autorizar a
-- NFC-e. NAO ha motor fiscal por UF aqui: estes campos sao DADO de cadastro (fonte: contador da
-- loja) que a api repassa ao EMISSOR DE TERCEIRO (ClienteFiscal). O emissor calcula tributos,
-- assina e transmite. Guardamos so o que o item precisa carregar na nota:
--
--   itens_fiscais   uma linha por (loja, item): NCM, CFOP, origem da mercadoria, unidade e a
--                   situacao tributaria (CSOSN para Simples/MEI, CST para regime normal). Um item
--                   SEM linha aqui nao pode gerar NFC-e (a emissao lista os itens pendentes).
--
-- Tambem: preferencia de emissao automatica por loja (auto_emitir) em fiscal_config. A nota so e
-- emitida de fato quando a loja aciona (painel) ou pelo endpoint de emissao automatica; o flag
-- governa quais pedidos concluidos entram nessa emissao em lote.

alter table public.fiscal_config
  add column auto_emitir boolean not null default false;

grant update (auto_emitir) on public.fiscal_config to whaviso_api;

create table public.itens_fiscais (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  item_id uuid not null references public.itens (id) on delete cascade,
  ncm text not null,                         -- 8 digitos (classificacao fiscal da mercadoria)
  cfop text not null,                        -- 4 digitos (natureza da operacao; ex.: 5102 venda)
  origem smallint not null default 0,        -- origem da mercadoria (0..8, tabela da SEFAZ)
  unidade text not null default 'UN',        -- unidade comercial/tributavel (ex.: UN, KG)
  csosn text,                                -- Simples Nacional/MEI (ex.: 102); exclusivo com cst
  cst text,                                  -- regime normal (ex.: 00); exclusivo com csosn
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint itens_fiscais_ncm check (ncm ~ '^[0-9]{8}$'),
  constraint itens_fiscais_cfop check (cfop ~ '^[0-9]{4}$'),
  constraint itens_fiscais_origem check (origem between 0 and 8),
  constraint itens_fiscais_unidade check (char_length(unidade) between 1 and 6),
  constraint itens_fiscais_csosn check (csosn is null or csosn ~ '^[0-9]{3}$'),
  constraint itens_fiscais_cst check (cst is null or cst ~ '^[0-9]{2,3}$'),
  -- Ao menos uma situacao tributaria: a emissao escolhe CSOSN ou CST pelo regime da loja.
  constraint itens_fiscais_situacao check (csosn is not null or cst is not null)
);
-- Um dado fiscal por item e loja (idempotencia do upsert pela tela).
create unique index itens_fiscais_loja_item on public.itens_fiscais (loja_id, item_id);
create index itens_fiscais_loja on public.itens_fiscais (loja_id);

create trigger trg_itens_fiscais_atualizado_em before update on public.itens_fiscais
  for each row execute function public.tocar_atualizado_em();

alter table public.itens_fiscais enable row level security;

-- api: cadastra e ajusta o dado fiscal do item (configuracao do catalogo, nao auditoria). Sem
-- DELETE: um item que nao deve emitir simplesmente nao recebe linha; desfazer = limpar a tela.
grant select, insert on public.itens_fiscais to whaviso_api;
grant update (ncm, cfop, origem, unidade, csosn, cst) on public.itens_fiscais to whaviso_api;
create policy api_itens_fiscais on public.itens_fiscais
  for all to whaviso_api using (true) with check (true);
