-- Fidelidade / cashback do consumidor final (retencao).
--
--   fidelidade_programas   configuracao do programa da loja (uma linha por loja): modo pontos ou
--                          cashback, taxas e limites de resgate. Editavel (UPDATE), sem DELETE.
--   fidelidade_movimentos  livro-razao append-only por cliente: acumulo e resgate. O saldo NAO
--                          e coluna mutavel: e derivado do livro (soma). `saldo_apos` e o retrato
--                          do saldo logo apos o movimento (conferencia/extrato).
--
-- Unidade do `valor`: cashback = centavos de credito; pontos = pontos inteiros. O resgate guarda
-- `desconto_centavos` (equivalente monetario aplicado ao pedido). Datas em UTC; negocio em
-- America/Sao_Paulo (a conversao e da borda). Nenhum dado pessoal nestas tabelas.

create table public.fidelidade_programas (
  loja_id uuid primary key references public.lojas (id) on delete cascade,
  ativo boolean not null default false,
  modo text not null default 'cashback',
  -- cashback: percentual em pontos-base (500 = 5,00%) sobre o subtotal pago (sem entrega).
  cashback_bps integer not null default 500,
  -- pontos: pontos ganhos por R$ 1,00 do subtotal pago, e quanto vale 1 ponto no resgate.
  pontos_por_real integer not null default 1,
  valor_ponto_centavos integer not null default 1,
  -- regras de resgate: minimo (na unidade do programa) e teto como % do subtotal do pedido.
  minimo_resgate integer not null default 0,
  max_resgate_bps integer not null default 5000,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fidelidade_programas_modo check (modo in ('pontos', 'cashback')),
  constraint fidelidade_programas_cashback_bps check (cashback_bps between 0 and 10000),
  constraint fidelidade_programas_pontos check (pontos_por_real between 1 and 1000),
  constraint fidelidade_programas_valor_ponto check (valor_ponto_centavos between 1 and 10000),
  constraint fidelidade_programas_minimo check (minimo_resgate >= 0),
  constraint fidelidade_programas_max_resgate check (max_resgate_bps between 1 and 10000)
);

create trigger trg_fidelidade_programas_atualizado_em before update on public.fidelidade_programas
  for each row execute function public.tocar_atualizado_em();

create table public.fidelidade_movimentos (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,            -- ordem total do livro
  loja_id uuid not null references public.lojas (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id),
  tipo text not null,
  valor integer not null,                             -- magnitude (> 0), unidade do programa
  desconto_centavos integer,                          -- so no resgate: desconto aplicado ao pedido
  pedido_id uuid not null references public.pedidos (id),
  saldo_apos integer not null,
  criado_por_user_id uuid,
  criado_em timestamptz not null default now(),
  constraint fidelidade_movimentos_tipo check (tipo in ('acumulo', 'resgate')),
  constraint fidelidade_movimentos_valor_positivo check (valor > 0),
  constraint fidelidade_movimentos_saldo_nao_negativo check (saldo_apos >= 0),
  constraint fidelidade_movimentos_desconto check (
    (tipo = 'resgate' and desconto_centavos is not null and desconto_centavos > 0)
    or (tipo = 'acumulo' and desconto_centavos is null)
  )
);
-- No maximo um acumulo e um resgate por pedido (idempotencia; corrida resolvida no banco).
create unique index fidelidade_movimentos_pedido_tipo on public.fidelidade_movimentos (pedido_id, tipo);
create index fidelidade_movimentos_cliente on public.fidelidade_movimentos (loja_id, cliente_id, seq desc);

-- Livro imutavel: UPDATE barrado por trigger (mesmo para o dono), DELETE por falta de grant.
create trigger trg_fidelidade_movimentos_imutavel before update on public.fidelidade_movimentos
  for each row execute function public.rejeitar_update_append_only();

alter table public.fidelidade_programas  enable row level security;
alter table public.fidelidade_movimentos enable row level security;

-- api: dona da configuracao (select/insert/update; sem delete) e do livro (select/insert).
grant select, insert, update on public.fidelidade_programas to whaviso_api;
grant select, insert on public.fidelidade_movimentos to whaviso_api;

create policy api_fidelidade_programas  on public.fidelidade_programas
  for all to whaviso_api using (true) with check (true);
create policy api_fidelidade_movimentos on public.fidelidade_movimentos
  for all to whaviso_api using (true) with check (true);
