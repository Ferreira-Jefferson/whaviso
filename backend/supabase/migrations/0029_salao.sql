-- Salao (mesas e comandas): o dono atende no balcao/mesa, abre uma comanda por mesa e lanca
-- itens do cardapio ate fechar. Autocontido: nao altera a tabela pedidos.
--
--   mesas          cadastro de mesas da loja (nome unico entre as ATIVAS)
--   comandas       sessao de uma mesa: no maximo UMA aberta por mesa a cada instante
--   comanda_itens  lancamentos (snapshot de nome e preco do item no momento do lancamento)
--
-- Dinheiro em centavos (integer). Nome e preco de cada item sao SNAPSHOT: mudar o cardapio
-- depois nunca reescreve comanda antiga. Sem DELETE: mesa some com `ativo = false`; comanda
-- encerra com `status = 'fechada'`. Para corrigir um lancamento, lance outro (estado/quantidade).

create table public.mesas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  capacidade smallint,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint mesas_capacidade_valida check (capacidade is null or capacidade > 0)
);
create index mesas_loja on public.mesas (loja_id, nome);
-- Nome unico apenas entre as mesas ATIVAS da loja (reaproveitar nome de mesa desativada e ok).
create unique index mesas_nome_ativa on public.mesas (loja_id, nome) where ativo;

create table public.comandas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  mesa_id uuid not null references public.mesas (id),
  status text not null default 'aberta' check (status in ('aberta', 'fechada')),
  aberta_por_user_id uuid not null,
  aberta_em timestamptz not null default now(),
  fechada_em timestamptz,
  total_centavos integer not null default 0,
  observacoes text,
  constraint comandas_total_nao_negativo check (total_centavos >= 0),
  constraint comandas_fechada_tem_data check (status <> 'fechada' or fechada_em is not null)
);
create index comandas_loja on public.comandas (loja_id, aberta_em);
create index comandas_mesa on public.comandas (mesa_id);
-- No maximo UMA comanda aberta por mesa a cada instante.
create unique index comandas_uma_aberta_por_mesa on public.comandas (mesa_id) where status = 'aberta';

create table public.comanda_itens (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  comanda_id uuid not null references public.comandas (id),
  item_id uuid not null references public.itens (id),
  nome_item text not null,
  quantidade integer not null check (quantidade > 0),
  preco_unitario_centavos integer not null,
  criado_em timestamptz not null default now(),
  constraint comanda_itens_preco_nao_negativo check (preco_unitario_centavos >= 0)
);
create index comanda_itens_comanda on public.comanda_itens (comanda_id);
create index comanda_itens_loja on public.comanda_itens (loja_id);

create trigger trg_mesas_atualizado_em before update on public.mesas
  for each row execute function public.tocar_atualizado_em();

-- RLS deny-all + grants. api: dona do salao (painel). Sem grant para zap/atendente.
-- Sem DELETE em nenhuma das tres (negocio muda de estado, nunca some).
alter table public.mesas         enable row level security;
alter table public.comandas      enable row level security;
alter table public.comanda_itens enable row level security;

grant select, insert, update on public.mesas, public.comandas, public.comanda_itens to whaviso_api;

create policy api_mesas         on public.mesas         for all to whaviso_api using (true) with check (true);
create policy api_comandas      on public.comandas      for all to whaviso_api using (true) with check (true);
create policy api_comanda_itens on public.comanda_itens for all to whaviso_api using (true) with check (true);
