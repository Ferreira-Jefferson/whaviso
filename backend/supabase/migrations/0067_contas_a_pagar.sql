-- Contas a pagar da loja (dinheiro SAINDO), em dois tipos concretos: Fornecedores e Pessoas. Nao
-- confundir com `pagamentos` (Pix que o cliente paga a loja, dinheiro ENTRANDO) nem com `custos`
-- (consumo medido de servicos externos: LLM, WhatsApp, mapas, fiscal).
--
-- O acerto do motoboy NAO usa estas tabelas: ele e derivado de motoboy_lancamentos/fechamentos
-- (entregas + ajustes, aplicando o regime). Aqui ficam os lancamentos DIGITADOS na mao: o que a loja
-- paga a fornecedor e a pessoa nao-motoboy. Dinheiro em centavos; vencimento e competencia como
-- data de negocio (America/Sao_Paulo). Sem DELETE: estado por `ativo`/`status`.

create type credor_tipo        as enum ('fornecedor', 'pessoa');
create type status_conta_pagar as enum ('a_pagar', 'pago');

-- Fornecedores: quem a loja paga e nao e pessoa cadastrada. telefone e PII (so cifra; nunca em log/claro).
create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  nome text not null,
  documento text,                               -- CNPJ/CPF opcional, texto livre curto
  telefone_cifrado bytea,                        -- cifra da aplicacao (AES-256-GCM); NULL se nao informado
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index fornecedores_loja on public.fornecedores (loja_id) where ativo;

-- contas_pagar: um lancamento manual a pagar. credor_tipo casa com EXATAMENTE uma FK preenchida.
create table public.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  credor_tipo credor_tipo not null,
  fornecedor_id uuid references public.fornecedores (id),
  pessoa_id uuid references public.pessoas (id),
  descricao text not null,
  valor_centavos integer not null,
  vencimento date,                              -- dia de negocio (America/Sao_Paulo)
  competencia date,                             -- a que periodo a despesa se refere (opcional)
  status status_conta_pagar not null default 'a_pagar',
  pago_em timestamptz,
  pago_por_user_id uuid references auth.users (id),
  criado_por_user_id uuid references auth.users (id),
  chave_idempotencia text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint contas_pagar_valor_positivo check (valor_centavos > 0),
  constraint contas_pagar_credor_coerente check (
    (credor_tipo = 'fornecedor' and fornecedor_id is not null and pessoa_id is null) or
    (credor_tipo = 'pessoa'     and pessoa_id    is not null and fornecedor_id is null)
  ),
  constraint contas_pagar_pago_tem_data check (status <> 'pago' or pago_em is not null),
  constraint contas_pagar_chave_fmt check (
    chave_idempotencia is null or chave_idempotencia ~ '^[A-Za-z0-9_.:-]{1,120}$'
  )
);
create index contas_pagar_loja_venc   on public.contas_pagar (loja_id, vencimento);
create index contas_pagar_loja_status on public.contas_pagar (loja_id, status);
create index contas_pagar_fornecedor  on public.contas_pagar (fornecedor_id) where fornecedor_id is not null;
create index contas_pagar_pessoa      on public.contas_pagar (pessoa_id) where pessoa_id is not null;
-- Reenvio do mesmo (loja, chave) nao duplica o lancamento.
create unique index contas_pagar_idem on public.contas_pagar (loja_id, chave_idempotencia)
  where chave_idempotencia is not null;

create trigger trg_fornecedores_atualizado_em before update on public.fornecedores
  for each row execute function public.tocar_atualizado_em();
create trigger trg_contas_pagar_atualizado_em before update on public.contas_pagar
  for each row execute function public.tocar_atualizado_em();

alter table public.fornecedores enable row level security;
alter table public.contas_pagar enable row level security;

-- api: dona do cadastro/lancamento (painel). Sem DELETE (RLS deny-all p/ anon/authenticated).
grant select, insert, update on public.fornecedores, public.contas_pagar to whaviso_api;

create policy api_fornecedores on public.fornecedores for all to whaviso_api using (true) with check (true);
create policy api_contas_pagar on public.contas_pagar for all to whaviso_api using (true) with check (true);
