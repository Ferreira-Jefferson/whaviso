-- Recebedor (subconta) e credencial do PSP + colunas de cobranca intermediada.
-- Complementa a 0085 (config por loja). O PSP (Asaas) fica atras da interface ClientePagamento;
-- enquanto nao houver credencial/implementacao, o caminho intermediado responde via stub.
--
-- Credencial do PSP = SEGREDO (cifrada, nunca em claro/log), nivel PLATAFORMA (o whaviso e o
-- marketplace no PSP). zap/atendente NAO acessam nada disto (SEC-032). Dinheiro em centavos.
-- Sem DELETE (estado, nao sumiço).

create type status_subconta_psp as enum ('pendente', 'aprovada', 'recusada');

-- Subconta/recebedor da loja no PSP (quem usa cartao ou Pix intermediado). So a referencia do
-- recebedor e o status do onboarding/KYC; nenhum dado sensivel de KYC fica aqui.
create table public.psp_subcontas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  provider text not null default 'asaas',
  subconta_ref text,
  status_kyc status_subconta_psp not null default 'pendente',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint psp_subcontas_provider check (provider in ('asaas'))
);
create unique index psp_subcontas_loja_provider on public.psp_subcontas (loja_id, provider);

create trigger trg_psp_subcontas_atualizado_em before update on public.psp_subcontas
  for each row execute function public.tocar_atualizado_em();

alter table public.psp_subcontas enable row level security;
grant select, insert, update on public.psp_subcontas to whaviso_api;
create policy api_psp_subcontas on public.psp_subcontas
  for all to whaviso_api using (true) with check (true);

-- Credencial do PSP (nivel plataforma): uma linha por provider; `chave_cifrada` nunca em claro.
create table public.credenciais_psp (
  provider text primary key,
  chave_cifrada bytea not null,
  atualizado_em timestamptz not null default now(),
  constraint credenciais_psp_provider check (provider in ('asaas'))
);

create trigger trg_credenciais_psp_atualizado_em before update on public.credenciais_psp
  for each row execute function public.tocar_atualizado_em();

alter table public.credenciais_psp enable row level security;
-- So a api (nunca zap/atendente): o segredo do PSP fica fora dos runtimes de atendimento (SEC-032).
grant select, insert, update on public.credenciais_psp to whaviso_api;
create policy api_credenciais_psp on public.credenciais_psp
  for all to whaviso_api using (true) with check (true);

-- Caminho intermediado na tabela de cobrancas (0008). Colunas nullable e aditivas: a v1 (chave
-- propria) segue gravando provider = 'manual', com meio/charge_ref/encargo nulos.
alter table public.pagamentos
  add column provider text not null default 'manual'
    constraint pagamentos_provider check (provider in ('manual', 'asaas')),
  add column meio text
    constraint pagamentos_meio check (meio is null or meio in ('pix', 'cartao')),
  add column charge_ref text,
  add column encargo_centavos integer
    constraint pagamentos_encargo_nao_negativo check (encargo_centavos is null or encargo_centavos >= 0),
  add column taxa_psp_centavos integer
    constraint pagamentos_taxa_psp_nao_negativa check (taxa_psp_centavos is null or taxa_psp_centavos >= 0);

-- charge_ref unico por provider: idempotencia do webhook (nao vale para o caminho manual).
create unique index pagamentos_provider_charge on public.pagamentos (provider, charge_ref)
  where charge_ref is not null;
