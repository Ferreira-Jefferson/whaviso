-- Pessoas: cadastro de quem trabalha a favor da loja + cargos (funcoes) editaveis + escala de
-- trabalho. "Pessoas" (nao "funcionarios") porque nem todo mundo que trabalha pro restaurante e
-- funcionario CLT: o motoboy e o churrasqueiro de fim de semana trabalham a favor da loja sem
-- vinculo. SEM folha de pagamento, SEM fiscal (so quem trabalha, em que cargo e quando).
--
-- cargos:   catalogo de funcoes. loja_id NULL = preset de plataforma (visivel a TODAS as lojas);
--           loja_id = <loja> = cargo proprio da loja. `sistema` = cargo fixo da plataforma. O
--           cargo 'motoboy' (sistema=true, chave='motoboy') NAO pode ser apagado, desativado nem
--           ter a chave alterada (trigger abaixo + guarda na api). Uma pessoa com cargo cuja
--           chave='motoboy' E o motoboy usado na entrega (nao ha conceito duplicado; o modulo de
--           entrega referencia pessoas com esse cargo).
-- pessoas:  quem trabalha a favor da loja. telefone e PII: nunca em claro, so cifrado (cifra da
--           aplicacao), para a api poder revelar/ligar sob permissao; nunca vai para log.
-- escalas:  dias (0=domingo..6=sabado) e horarios que a pessoa trabalha. Varias por pessoa.
-- Sem DELETE em nenhuma: tabelas mudam de estado (ativo = false), nunca somem.

-- 1. Cargos -----------------------------------------------------------------------------------
create table public.cargos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid references public.lojas (id) on delete cascade,   -- NULL = preset de plataforma
  chave text,                                                    -- estavel (ex.: 'motoboy'); NULL nos cargos da loja
  nome text not null,
  sistema boolean not null default false,                        -- cargo fixo da plataforma
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint cargos_chave_fmt check (chave is null or chave ~ '^[a-z][a-z0-9_]*$'),
  -- cargo de plataforma e imutavel na origem: todo cargo de sistema e preset (loja_id NULL).
  constraint cargos_sistema_sem_loja check (not sistema or loja_id is null)
);
-- Preset de plataforma e unico por chave; cargo de loja nao usa chave.
create unique index cargos_chave_plataforma on public.cargos (chave) where loja_id is null and chave is not null;
create index cargos_loja on public.cargos (loja_id) where loja_id is not null;

-- 2. Pessoas ----------------------------------------------------------------------------------
create table public.pessoas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  cargo_id uuid not null references public.cargos (id),
  telefone_cifrado bytea,                                        -- cifra da aplicacao; NULL se nao informado
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index pessoas_loja on public.pessoas (loja_id) where ativo;
create index pessoas_cargo on public.pessoas (cargo_id);

-- 3. Escalas ----------------------------------------------------------------------------------
create table public.escalas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  pessoa_id uuid not null references public.pessoas (id) on delete cascade,
  dia_semana smallint not null,
  entrada time not null,
  saida time not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint escalas_dia_semana_faixa check (dia_semana between 0 and 6)
);
create index escalas_pessoa on public.escalas (pessoa_id) where ativo;
create index escalas_loja on public.escalas (loja_id);

create trigger trg_cargos_atualizado_em before update on public.cargos
  for each row execute function public.tocar_atualizado_em();
create trigger trg_pessoas_atualizado_em before update on public.pessoas
  for each row execute function public.tocar_atualizado_em();

-- 4. Guarda do cargo de sistema (motoboy). Mesmo para o dono da tabela: um cargo de sistema nao
--    pode ser desativado nem ter chave/sistema alterados (o UPDATE de nome segue permitido). O
--    DELETE ja e negado a todos os roles de servico (grant). Defesa em profundidade da guarda na api.
create or replace function public.proteger_cargo_sistema()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.sistema then
      raise exception 'cargo de sistema nao pode ser removido'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;
  if old.sistema then
    if new.ativo is distinct from true then
      raise exception 'cargo de sistema nao pode ser desativado'
        using errcode = 'insufficient_privilege';
    end if;
    if new.chave is distinct from old.chave or new.sistema is distinct from old.sistema then
      raise exception 'cargo de sistema tem chave/sistema imutaveis'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_cargos_proteger_sistema before update or delete on public.cargos
  for each row execute function public.proteger_cargo_sistema();

-- 5. RLS deny-all (anon/authenticated nao recebem nada) + grants de servico. ------------------
alter table public.cargos  enable row level security;
alter table public.pessoas enable row level security;
alter table public.escalas enable row level security;

-- api: dona do cadastro (painel). Sem DELETE (estado via `ativo`).
grant select, insert, update on public.cargos, public.pessoas, public.escalas to whaviso_api;

create policy api_cargos  on public.cargos  for all to whaviso_api using (true) with check (true);
create policy api_pessoas on public.pessoas for all to whaviso_api using (true) with check (true);
create policy api_escalas on public.escalas for all to whaviso_api using (true) with check (true);

-- 6. Presets de plataforma (loja_id NULL). Vai em MIGRATION (upsert) porque o seed nao roda no
--    cloud. Os nao-sistema servem de catalogo inicial; a loja usa (cria pessoas) ou cria os seus
--    proprios. 'motoboy' e fixo (sistema=true). Textos sem emoji nem travessao.
insert into public.cargos (loja_id, chave, nome, sistema) values
  (null, 'cozinheira',        'Cozinheira',          false),
  (null, 'ajudante_cozinha',  'Ajudante de cozinha', false),
  (null, 'atendente',         'Atendente',           false),
  (null, 'marmiteira',        'Marmiteira',          false),
  (null, 'recepcao',          'Recepção',            false),
  (null, 'garcom',            'Garçom',              false),
  (null, 'motoboy',           'Motoboy',             true)
on conflict (chave) where loja_id is null and chave is not null
do update set nome = excluded.nome, sistema = excluded.sistema;
