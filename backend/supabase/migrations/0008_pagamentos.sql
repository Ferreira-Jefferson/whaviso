-- Pagamentos: Pix enviado na conversa. A chave Pix é POR LOJA (loja_pix); o BR Code/txid é
-- por cobrança de pedido. Chave Pix só como hash + cifra da aplicação, nunca em claro.

create type status_pagamento as enum ('pendente', 'pago', 'expirado', 'cancelado');

create table public.loja_pix (
  loja_id uuid primary key references public.lojas (id) on delete cascade,
  tipo text not null,                           -- cpf, cnpj, email, telefone, aleatoria
  chave_hash text not null,                     -- sha256 da chave
  chave_cifrada bytea not null,                 -- cifra da aplicação (necessária para gerar o BR Code)
  titular text not null,
  cidade text,                                  -- campo obrigatório do BR Code
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint loja_pix_hash_fmt check (chave_hash ~ '^[0-9a-f]{64}$')
);

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  pedido_id uuid not null references public.pedidos (id),
  status status_pagamento not null default 'pendente',
  valor_centavos integer not null,
  txid text,
  br_code text,                                 -- "copia e cola" enviado ao cliente
  expira_em timestamptz,
  pago_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pagamentos_valor_positivo check (valor_centavos > 0),
  constraint pagamentos_pago_tem_data check (status <> 'pago' or pago_em is not null)
);
create unique index pagamentos_loja_txid on public.pagamentos (loja_id, txid) where txid is not null;
create index pagamentos_pedido on public.pagamentos (pedido_id);
create index pagamentos_loja_status on public.pagamentos (loja_id, status, criado_em);

create trigger trg_loja_pix_atualizado_em before update on public.loja_pix
  for each row execute function public.tocar_atualizado_em();
create trigger trg_pagamentos_atualizado_em before update on public.pagamentos
  for each row execute function public.tocar_atualizado_em();

alter table public.loja_pix   enable row level security;
alter table public.pagamentos enable row level security;

-- api: dona da chave Pix e dos pagamentos (conciliação). atendente: abre a cobrança Pix do
-- pedido e a lê; NÃO toca a chave da loja.
grant select, insert, update on public.loja_pix, public.pagamentos to whaviso_api;
grant select, insert on public.pagamentos to whaviso_atendente;

create policy api_loja_pix        on public.loja_pix   for all to whaviso_api using (true) with check (true);
create policy api_pagamentos      on public.pagamentos for all to whaviso_api using (true) with check (true);
create policy atendente_pagamentos on public.pagamentos for all to whaviso_atendente using (true) with check (true);
