-- Promocoes da loja: cupons (percentual/fixo) e combos (preco promocional de um conjunto de itens).
--
--   promocoes        uma por loja: tipo, codigo (cupom; opcional no combo), valor, janela de validade,
--                    limites de uso (total e por cliente), pedido minimo e flag `ativo`.
--                    Sem DELETE: a promocao e desligada por `ativo = false` (historico de usos preservado).
--   promocao_itens   itens que compoem um combo (item + quantidade). Vazio para cupons.
--   promocao_usos    ledger de usos (um por promocao+pedido, idempotente): base dos limites e do relatorio.
--
-- Semantica de `valor` (conferida por CHECK):
--   cupom_percentual  percentual inteiro 1..100 sobre o subtotal (taxa de entrega nunca entra)
--   cupom_fixo        desconto em centavos (> 0), limitado ao subtotal
--   combo             preco final do combo em centavos (>= 0), por unidade do conjunto de itens
-- Dinheiro em centavos; datas guardadas em UTC (a regra de negocio e America/Sao_Paulo, convertida na borda).
-- Nenhuma coluna de PII: o cliente e referenciado so por cliente_id.

create type tipo_promocao as enum ('cupom_percentual', 'cupom_fixo', 'combo');

create table public.promocoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  tipo tipo_promocao not null,
  codigo text,
  valor integer not null,
  inicio_em timestamptz,
  fim_em timestamptz,
  limite_total integer,
  limite_por_cliente integer,
  min_pedido_centavos integer not null default 0,
  desconto_maximo_centavos integer,
  ativo boolean not null default true,
  criado_por_user_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint promocoes_nome_tamanho check (char_length(nome) between 1 and 120),
  constraint promocoes_codigo_fmt check (codigo is null or codigo ~ '^[A-Z0-9_-]{3,30}$'),
  constraint promocoes_cupom_tem_codigo check (tipo = 'combo' or codigo is not null),
  constraint promocoes_valor_confere check (
    (tipo = 'cupom_percentual' and valor between 1 and 100)
    or (tipo = 'cupom_fixo' and valor > 0)
    or (tipo = 'combo' and valor >= 0)
  ),
  constraint promocoes_janela_valida check (inicio_em is null or fim_em is null or fim_em > inicio_em),
  constraint promocoes_limite_total_positivo check (limite_total is null or limite_total > 0),
  constraint promocoes_limite_cliente_positivo check (limite_por_cliente is null or limite_por_cliente > 0),
  constraint promocoes_minimo_nao_negativo check (min_pedido_centavos >= 0),
  constraint promocoes_teto_positivo check (desconto_maximo_centavos is null or desconto_maximo_centavos > 0)
);
-- Codigo unico por loja, sem diferenciar caixa (guardado em maiusculas).
create unique index promocoes_codigo_loja on public.promocoes (loja_id, codigo) where codigo is not null;
create index promocoes_loja on public.promocoes (loja_id, criado_em desc);

create table public.promocao_itens (
  promocao_id uuid not null references public.promocoes (id) on delete cascade,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  item_id uuid not null references public.itens (id),
  quantidade integer not null default 1,
  primary key (promocao_id, item_id),
  constraint promocao_itens_quantidade check (quantidade between 1 and 99)
);
create index promocao_itens_loja on public.promocao_itens (loja_id);

create table public.promocao_usos (
  id uuid primary key default gen_random_uuid(),
  promocao_id uuid not null references public.promocoes (id) on delete cascade,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  cliente_id uuid references public.clientes (id) on delete cascade,
  desconto_centavos integer not null,
  criado_em timestamptz not null default now(),
  constraint promocao_usos_desconto_nao_negativo check (desconto_centavos >= 0)
);
-- Idempotencia: um pedido usa a mesma promocao no maximo uma vez.
create unique index promocao_usos_unico on public.promocao_usos (promocao_id, pedido_id);
create index promocao_usos_cliente on public.promocao_usos (promocao_id, cliente_id) where cliente_id is not null;
create index promocao_usos_loja on public.promocao_usos (loja_id);

create trigger trg_promocoes_atualizado_em before update on public.promocoes
  for each row execute function public.tocar_atualizado_em();

alter table public.promocoes      enable row level security;
alter table public.promocao_itens enable row level security;
alter table public.promocao_usos  enable row level security;

-- api e dona das tres tabelas. Sem DELETE (negocio muda de estado, nao some): combo editavel
-- so por nova promocao; uso e ledger append-only (sem UPDATE).
grant select, insert, update on public.promocoes      to whaviso_api;
grant select, insert         on public.promocao_itens to whaviso_api;
grant select, insert         on public.promocao_usos  to whaviso_api;

-- Isolamento multi-tenant enforcado na api por loja_id em toda consulta (padrao do projeto).
create policy api_promocoes      on public.promocoes      for all to whaviso_api using (true) with check (true);
create policy api_promocao_itens on public.promocao_itens for all to whaviso_api using (true) with check (true);
create policy api_promocao_usos  on public.promocao_usos  for all to whaviso_api using (true) with check (true);
