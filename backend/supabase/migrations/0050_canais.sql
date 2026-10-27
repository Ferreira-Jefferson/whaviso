-- Canais externos de pedidos (iFood e outros) por loja.
--
--   canais_loja    uma conexao por (loja, canal): credencial CIFRADA pela aplicacao, metadados nao
--                  secretos em `config` e estado da ultima sincronizacao.
--   canal_pedidos  mapa (canal da loja, id externo) -> pedido interno. A unicidade e a
--                  IDEMPOTENCIA da importacao: o mesmo pedido do canal nunca vira dois pedidos.
--
-- Pedido de canal entra no MESMO modelo de `pedidos`, marcado em `pedidos.origem` ('ifood' para o
-- canal iFood, 'manual' para o canal generico 'outro'). Nenhuma coluna de PII do consumidor aqui
-- nem em canal_pedidos (nome/telefone/endereco ficam no canal). Sem DELETE (negocio muda de estado).
--
-- Segredo (ver 0012_credenciais_llm): `credencial_cifrada` e cifra da aplicacao (master key fora
-- do banco). A api ESCREVE e le so metadado na listagem; o unico SELECT da coluna e concedido a api
-- para o pull de sincronizacao (DECISAO DO DONO: alternativa = mover o pull para um worker).

create type canal_pedido as enum ('ifood', 'outro');

create table public.canais_loja (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  canal canal_pedido not null,
  credencial_cifrada bytea not null,
  ultimos4 text,
  config jsonb not null default '{}'::jsonb,
  ativo boolean not null default true,
  ultima_sincronizacao_em timestamptz,
  -- Codigo curto do ultimo erro (nunca texto cru do provedor).
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint canais_loja_ultimos4_fmt check (ultimos4 is null or ultimos4 ~ '^[0-9A-Za-z]{2,8}$'),
  constraint canais_loja_config_objeto check (jsonb_typeof(config) = 'object'),
  constraint canais_loja_erro_tamanho check (ultimo_erro is null or char_length(ultimo_erro) <= 60)
);
create unique index canais_loja_unico on public.canais_loja (loja_id, canal);

create table public.canal_pedidos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  canal_loja_id uuid not null references public.canais_loja (id),
  id_externo text not null,
  pedido_id uuid not null references public.pedidos (id),
  criado_em timestamptz not null default now(),
  constraint canal_pedidos_id_externo_tamanho check (char_length(id_externo) between 1 and 128)
);
create unique index canal_pedidos_idempotencia on public.canal_pedidos (canal_loja_id, id_externo);
create unique index canal_pedidos_pedido on public.canal_pedidos (pedido_id);
create index canal_pedidos_loja on public.canal_pedidos (loja_id, criado_em desc);

create trigger trg_canais_loja_atualizado_em before update on public.canais_loja
  for each row execute function public.tocar_atualizado_em();

alter table public.canais_loja   enable row level security;
alter table public.canal_pedidos enable row level security;

-- api: dona das duas tabelas. canais_loja com grant por coluna (sem DELETE).
grant select (id, loja_id, canal, credencial_cifrada, ultimos4, config, ativo, ultima_sincronizacao_em,
              ultimo_erro, criado_em, atualizado_em)
  on public.canais_loja to whaviso_api;
grant insert (loja_id, canal, credencial_cifrada, ultimos4, config, ativo)
  on public.canais_loja to whaviso_api;
grant update (credencial_cifrada, ultimos4, config, ativo, ultima_sincronizacao_em, ultimo_erro)
  on public.canais_loja to whaviso_api;
grant select, insert on public.canal_pedidos to whaviso_api;

-- Isolamento multi-tenant enforcado na api por loja_id em toda consulta (padrao do projeto).
create policy api_canais_loja   on public.canais_loja   for all to whaviso_api using (true) with check (true);
create policy api_canal_pedidos on public.canal_pedidos for all to whaviso_api using (true) with check (true);
