-- Cardápio: o eixo de normalização do produto.
--
--   grupos_opcoes     seção personalizável reutilizável (tamanho, adicional, customizada):
--                     obrigatória ou opcional, com limite de escolhas
--   opcoes            valores do grupo (preço em centavos, padrão, esgotado_ate)
--   categorias        agrupam itens; têm programação por dia/horário
--   categoria_grupos  M:N: grupos da categoria, herdados por todos os itens dela
--   itens             o que se vende; herdam os grupos da categoria
--   item_grupos       exceção por item: acrescenta um grupo ou remove um herdado
--
-- Liga/desliga: `ativo` (cadastro) + `esgotado_ate` (o "esgotado hoje" volta sozinho quando o
-- instante passa). Add-on dependente de tamanho: grupos_opcoes.aplica_a_opcao_id.
-- Dinheiro em centavos (integer).

create type tipo_grupo as enum ('tamanho', 'adicional', 'customizado');

create table public.grupos_opcoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  tipo tipo_grupo not null default 'customizado',
  obrigatorio boolean not null default false,
  min_escolhas smallint not null default 0,
  max_escolhas smallint,                         -- NULL = sem limite
  aplica_a_opcao_id uuid,                        -- FK adicionada abaixo (referência circular com opcoes)
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint grupos_min_nao_negativo check (min_escolhas >= 0),
  constraint grupos_max_valido check (max_escolhas is null or max_escolhas >= greatest(min_escolhas, 1)),
  constraint grupos_obrigatorio_min check (not obrigatorio or min_escolhas >= 1)
);
create index grupos_opcoes_loja on public.grupos_opcoes (loja_id, ordem);

create table public.opcoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  grupo_id uuid not null references public.grupos_opcoes (id) on delete cascade,
  nome text not null,
  preco_centavos integer not null default 0,
  padrao boolean not null default false,
  ativo boolean not null default true,
  esgotado_ate timestamptz,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint opcoes_preco_nao_negativo check (preco_centavos >= 0)
);
create index opcoes_grupo on public.opcoes (grupo_id, ordem);
create index opcoes_loja on public.opcoes (loja_id);

alter table public.grupos_opcoes
  add constraint grupos_aplica_a_opcao_fk
  foreign key (aplica_a_opcao_id) references public.opcoes (id);
create index grupos_aplica_a_opcao on public.grupos_opcoes (aplica_a_opcao_id)
  where aplica_a_opcao_id is not null;

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  descricao text,
  programacao jsonb,                              -- dias/horários em que a categoria aparece (NULL = sempre)
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index categorias_loja on public.categorias (loja_id, ordem);

create table public.categoria_grupos (
  categoria_id uuid not null references public.categorias (id) on delete cascade,
  grupo_id uuid not null references public.grupos_opcoes (id) on delete cascade,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  ordem integer not null default 0,
  primary key (categoria_id, grupo_id)
);
create index categoria_grupos_grupo on public.categoria_grupos (grupo_id);
create index categoria_grupos_loja on public.categoria_grupos (loja_id);

create table public.itens (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  categoria_id uuid not null references public.categorias (id),
  nome text not null,
  descricao text,
  preco_centavos integer not null default 0,      -- base; com grupo de tamanho o preço final soma a opção
  imagem_url text,
  sugerivel boolean not null default false,       -- candidato ao "quer adicionar?"
  ativo boolean not null default true,
  esgotado_ate timestamptz,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint itens_preco_nao_negativo check (preco_centavos >= 0)
);
create index itens_loja_categoria on public.itens (loja_id, categoria_id, ordem);
create index itens_categoria on public.itens (categoria_id);

create table public.item_grupos (
  item_id uuid not null references public.itens (id) on delete cascade,
  grupo_id uuid not null references public.grupos_opcoes (id) on delete cascade,
  loja_id uuid not null references public.lojas (id) on delete cascade,
  incluir boolean not null default true,          -- true: acrescenta; false: remove um grupo herdado da categoria
  ordem integer not null default 0,
  primary key (item_id, grupo_id)
);
create index item_grupos_grupo on public.item_grupos (grupo_id);
create index item_grupos_loja on public.item_grupos (loja_id);

create trigger trg_grupos_opcoes_atualizado_em before update on public.grupos_opcoes
  for each row execute function public.tocar_atualizado_em();
create trigger trg_opcoes_atualizado_em before update on public.opcoes
  for each row execute function public.tocar_atualizado_em();
create trigger trg_categorias_atualizado_em before update on public.categorias
  for each row execute function public.tocar_atualizado_em();
create trigger trg_itens_atualizado_em before update on public.itens
  for each row execute function public.tocar_atualizado_em();

-- RLS + grants. api: dona do cardápio (painel). atendente: só lê (monta o pedido sobre ele).
-- Tabelas de ligação (categoria_grupos, item_grupos) não têm UPDATE de negócio; trocar uma
-- ligação é feito com `ordem`/`incluir`, e desligar um grupo herdado é incluir = false.
alter table public.grupos_opcoes    enable row level security;
alter table public.opcoes           enable row level security;
alter table public.categorias       enable row level security;
alter table public.categoria_grupos enable row level security;
alter table public.itens            enable row level security;
alter table public.item_grupos      enable row level security;

grant select, insert, update on
  public.grupos_opcoes, public.opcoes, public.categorias, public.categoria_grupos,
  public.itens, public.item_grupos
  to whaviso_api;
grant select on
  public.grupos_opcoes, public.opcoes, public.categorias, public.categoria_grupos,
  public.itens, public.item_grupos
  to whaviso_atendente;

create policy api_grupos_opcoes    on public.grupos_opcoes    for all to whaviso_api using (true) with check (true);
create policy api_opcoes           on public.opcoes           for all to whaviso_api using (true) with check (true);
create policy api_categorias       on public.categorias       for all to whaviso_api using (true) with check (true);
create policy api_categoria_grupos on public.categoria_grupos for all to whaviso_api using (true) with check (true);
create policy api_itens            on public.itens            for all to whaviso_api using (true) with check (true);
create policy api_item_grupos      on public.item_grupos      for all to whaviso_api using (true) with check (true);

create policy atendente_grupos_opcoes    on public.grupos_opcoes    for select to whaviso_atendente using (true);
create policy atendente_opcoes           on public.opcoes           for select to whaviso_atendente using (true);
create policy atendente_categorias       on public.categorias       for select to whaviso_atendente using (true);
create policy atendente_categoria_grupos on public.categoria_grupos for select to whaviso_atendente using (true);
create policy atendente_itens            on public.itens            for select to whaviso_atendente using (true);
create policy atendente_item_grupos      on public.item_grupos      for select to whaviso_atendente using (true);
