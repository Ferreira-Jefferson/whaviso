-- E17: Catálogo de PRODUTOS do dono da conta (nome + preço de venda). Dono: módulo
-- `produtos` da api. Produto é dado INTERNO do dono (mini-estoque de itens de venda);
-- NUNCA vai para mensagem ao devedor. Espelha `categorias` (0081): isolado por conta,
-- nome único entre ativos, soft-delete (arquivado=true). Sem custo, sem categoria (E17).
-- "Remover" é soft-delete: nenhum role tem DELETE (regra de não-DELETE de negócio).

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  nome text not null,
  -- Preço de VENDA em centavos (>= 0). Sem custo (decisão E17: custo por produto tem
  -- variáveis demais). É o ponto de partida do item do combinado (snapshot congelado lá).
  preco_venda_centavos bigint not null default 0,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint produtos_nome_tam check (char_length(nome) between 1 and 80),
  constraint produtos_preco_nao_neg check (preco_venda_centavos >= 0)
);

-- Nome único por conta entre os ativos (case-insensitive); índice das ativas p/ listagem.
create unique index produtos_unq    on public.produtos (profile_id, lower(nome)) where not arquivado;
create index        produtos_ativos on public.produtos (profile_id)               where not arquivado;

create trigger trg_produtos_atualizado_em
  before update on public.produtos
  for each row execute function public.tocar_atualizado_em();

-- Grants + RLS no padrão das tabelas user-owned (0008/0012/0081): só a api; sem DELETE;
-- zap não acessa.
grant select, insert, update on public.produtos to whaviso_api;
alter table public.produtos enable row level security;
create policy api_produtos on public.produtos for all to whaviso_api using (true) with check (true);
