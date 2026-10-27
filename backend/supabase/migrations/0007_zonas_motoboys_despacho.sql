-- Entrega: zonas (precificação), motoboys, fechamento do dia, lançamentos e corridas (despacho).
--
-- zonas_entrega: configuração estável; precifica a entrega (taxa do cliente + valor do motoboy).
-- motoboys:     cadastro completo; Pix e telefone só como hash (+ cifra da aplicação para poder pagar).
-- motoboy_lancamentos: append-only. Uma linha automática por entrega + linhas manuais de ajuste.
--   A soma do dia por motoboy é DERIVADA (não há total armazenado, para não divergir).
-- fechamentos:  o dia de um motoboy, marcável como pago. Liga aos lançamentos por (motoboy_id, data).
-- corridas:     lote de despacho (1 motoboy, N pedidos); a ordem de parada fica em pedidos.ordem_parada.
-- A "data" do fechamento/lançamento é a data de negócio em America/Sao_Paulo, calculada pela api.

create type tipo_zona        as enum ('bairro', 'poligono', 'raio');
create type tipo_veiculo     as enum ('moto', 'bicicleta', 'carro', 'a_pe');
create type status_fechamento as enum ('aberto', 'pago');
create type tipo_lancamento  as enum ('entrega', 'ajuste');
create type status_corrida   as enum ('montando', 'despachada', 'concluida');

create table public.zonas_entrega (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  tipo tipo_zona not null default 'bairro',
  bairro text,                                  -- tipo = bairro
  area jsonb,                                   -- tipo = poligono (GeoJSON) ou raio (centro + metros)
  taxa_cliente_centavos integer not null default 0,
  valor_motoboy_centavos integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint zonas_valores check (taxa_cliente_centavos >= 0 and valor_motoboy_centavos >= 0),
  constraint zonas_definicao check (
    (tipo = 'bairro' and bairro is not null) or (tipo <> 'bairro' and area is not null)
  )
);
create index zonas_loja on public.zonas_entrega (loja_id) where ativo;

create table public.motoboys (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  telefone_hash text,
  telefone_cifrado bytea,
  veiculo tipo_veiculo not null default 'moto',
  placa text,
  pix_tipo text,
  pix_hash text,                                -- sha256 da chave Pix
  pix_cifrado bytea,                            -- cifra da aplicação (necessária para pagar)
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint motoboys_telefone_hash_fmt check (telefone_hash is null or telefone_hash ~ '^[0-9a-f]{64}$'),
  constraint motoboys_pix_hash_fmt check (pix_hash is null or pix_hash ~ '^[0-9a-f]{64}$')
);
create index motoboys_loja on public.motoboys (loja_id) where ativo;

create table public.fechamentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  motoboy_id uuid not null references public.motoboys (id),
  data date not null,                           -- dia de negócio (America/Sao_Paulo)
  status status_fechamento not null default 'aberto',
  pago_em timestamptz,
  pago_por_user_id uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fechamentos_pago_tem_data check (status <> 'pago' or pago_em is not null)
);
create unique index fechamentos_motoboy_dia on public.fechamentos (motoboy_id, data);
create index fechamentos_loja_dia on public.fechamentos (loja_id, data);

create table public.motoboy_lancamentos (
  id bigint generated always as identity primary key,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  motoboy_id uuid not null references public.motoboys (id),
  data date not null,                           -- dia de negócio (America/Sao_Paulo)
  tipo tipo_lancamento not null,
  pedido_id uuid references public.pedidos (id),
  valor_centavos integer not null,              -- ajuste pode ser negativo
  descricao text,
  criado_por_user_id uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  constraint lancamentos_entrega_tem_pedido check (tipo <> 'entrega' or pedido_id is not null),
  constraint lancamentos_entrega_positivo check (tipo <> 'entrega' or valor_centavos >= 0)
);
-- A linha automática é idempotente: um pedido gera no máximo um lançamento de entrega.
create unique index lancamentos_entrega_unica on public.motoboy_lancamentos (pedido_id) where tipo = 'entrega';
create index lancamentos_motoboy_dia on public.motoboy_lancamentos (motoboy_id, data);
create index lancamentos_loja_dia on public.motoboy_lancamentos (loja_id, data);

create table public.corridas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  motoboy_id uuid references public.motoboys (id),
  status status_corrida not null default 'montando',
  sugerida boolean not null default false,       -- true: veio da roteirização automática
  despachada_em timestamptz,
  concluida_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index corridas_loja_status on public.corridas (loja_id, status, criado_em);
create index corridas_motoboy on public.corridas (motoboy_id) where motoboy_id is not null;

create trigger trg_zonas_atualizado_em before update on public.zonas_entrega
  for each row execute function public.tocar_atualizado_em();
create trigger trg_motoboys_atualizado_em before update on public.motoboys
  for each row execute function public.tocar_atualizado_em();
create trigger trg_fechamentos_atualizado_em before update on public.fechamentos
  for each row execute function public.tocar_atualizado_em();
create trigger trg_corridas_atualizado_em before update on public.corridas
  for each row execute function public.tocar_atualizado_em();

create trigger trg_lancamentos_imutavel before update on public.motoboy_lancamentos
  for each row execute function public.rejeitar_update_append_only();

-- FKs que fecham as colunas de pedidos (criado na 0005).
alter table public.pedidos
  add constraint pedidos_zona_fk    foreign key (zona_id)    references public.zonas_entrega (id),
  add constraint pedidos_corrida_fk foreign key (corrida_id) references public.corridas (id),
  add constraint pedidos_motoboy_fk foreign key (motoboy_id) references public.motoboys (id);

alter table public.zonas_entrega       enable row level security;
alter table public.motoboys            enable row level security;
alter table public.fechamentos         enable row level security;
alter table public.motoboy_lancamentos enable row level security;
alter table public.corridas            enable row level security;

-- api: dona de tudo (painel de entrega). Lançamento é append-only (select, insert).
grant select, insert, update on
  public.zonas_entrega, public.motoboys, public.fechamentos, public.corridas
  to whaviso_api;
grant select, insert on public.motoboy_lancamentos to whaviso_api;
-- atendente: só lê as zonas (precifica a entrega no pedido).
grant select on public.zonas_entrega to whaviso_atendente;

create policy api_zonas_entrega       on public.zonas_entrega       for all to whaviso_api using (true) with check (true);
create policy api_motoboys            on public.motoboys            for all to whaviso_api using (true) with check (true);
create policy api_fechamentos         on public.fechamentos         for all to whaviso_api using (true) with check (true);
create policy api_motoboy_lancamentos on public.motoboy_lancamentos for all to whaviso_api using (true) with check (true);
create policy api_corridas            on public.corridas            for all to whaviso_api using (true) with check (true);
create policy atendente_zonas_entrega on public.zonas_entrega       for select to whaviso_atendente using (true);
