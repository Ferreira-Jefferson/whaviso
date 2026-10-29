-- Taxa de intermediacao de pagamento (whaviso -> por transacao intermediada).
-- NADA de taxa fica hardcoded no codigo: o valor vive no banco e muda so pela tela de admin.
--
-- Dois niveis:
--   1) config_plataforma (singleton): taxa PADRAO da plataforma (fallback).
--   2) planos.taxa_intermediacao_centavos (nullable): override por plano; NULL = herda o padrao
--      (diferente de 0 = taxa zero explicita).
-- A taxa aplicada a um pedido e resolvida AO VIVO (assinatura ativa da conta -> plano -> taxa, senao
-- o padrao), com cache em processo na api (ver @whaviso/shared/taxas). Nao e congelada na assinatura:
-- taxa por transacao e continua, diferente do valor mensal (esse sim congela na assinatura).
--
-- Nao e segredo (e preco, exibido ao restaurante): sem cifra. O que importa e integridade (so operador
-- com 'planos:gerir' altera, auditado em eventos) e leitura barata (cache). Dinheiro em centavos (int).
-- Sem DELETE: config muda de valor, nunca some.

create table public.config_plataforma (
  id smallint primary key default 1,
  taxa_intermediacao_padrao_centavos integer not null,
  atualizado_em timestamptz not null default now(),
  constraint config_plataforma_singleton check (id = 1),
  constraint config_plataforma_taxa_nao_negativa check (taxa_intermediacao_padrao_centavos >= 0)
);

create trigger trg_config_plataforma_atualizado_em before update on public.config_plataforma
  for each row execute function public.tocar_atualizado_em();

alter table public.config_plataforma enable row level security;
-- Sem insert/delete: a linha unica nasce aqui (abaixo) e dali so recebe UPDATE pela api.
grant select, update on public.config_plataforma to whaviso_api;
create policy api_config_plataforma on public.config_plataforma
  for all to whaviso_api using (true) with check (true);

-- Valor inicial do padrao: R$ 0,50 = 50 centavos. Semeado por MIGRATION (o seed nao roda no cloud),
-- como os demais dados de catalogo. Idempotente.
insert into public.config_plataforma (id, taxa_intermediacao_padrao_centavos)
  values (1, 50)
  on conflict (id) do nothing;

-- Override por plano. NULL = herda o padrao da plataforma; 0 = taxa zero explicita.
alter table public.planos
  add column taxa_intermediacao_centavos integer
    constraint planos_taxa_nao_negativa
      check (taxa_intermediacao_centavos is null or taxa_intermediacao_centavos >= 0);
