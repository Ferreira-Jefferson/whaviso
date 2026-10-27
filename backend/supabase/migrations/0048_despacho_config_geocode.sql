-- Roteirizacao de despacho: parametros por loja + ownership da geocodificacao de enderecos.
--
--   despacho_config   uma linha por loja (opcional: sem linha valem os defaults do modulo). Guarda os
--                     parametros do agrupamento automatico de corridas: preparo estimado, janela de
--                     saida, desvio maximo, capacidade da corrida, origem (a loja) e velocidade media
--                     usada no fallback em linha reta quando o provedor de mapas esta fora.
--   enderecos         as colunas lat/lng/geocodificado_em ja existem desde a 0006. Aqui entra so
--                     `geocode_falha_em` (marca de falha permanente do geocode, para nao repetir a
--                     chamada ao provedor a cada sugestao) e o ownership por grants/trigger.
--
-- Ownership (decisao do modulo roteirizacao): a api e a UNICA que grava lat/lng/geocodificado_em/
-- geocode_falha_em. O atendente continua criando/atualizando enderecos, mas sem poder tocar nessas
-- colunas (grant por coluna). Quando o TEXTO do endereco muda, um trigger zera a geocodificacao para
-- ela ser refeita (o chamador nao precisa lembrar). Dinheiro n/a; datas em UTC no banco.
-- Sem DELETE (tabelas de negocio mudam de estado, nunca somem).

create table public.despacho_config (
  loja_id uuid primary key references public.lojas (id) on delete cascade,
  preparo_base_min smallint not null default 20,
  preparo_por_item_min numeric(4,1) not null default 1.0,
  max_pedidos_corrida smallint not null default 4,
  janela_saida_min smallint not null default 10,
  desvio_max_min smallint not null default 8,
  origem_lat numeric(9,6),
  origem_lng numeric(9,6),
  volta_a_loja boolean not null default false,
  velocidade_media_kmh smallint not null default 25,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint despacho_config_preparo_base check (preparo_base_min between 0 and 120),
  constraint despacho_config_preparo_item check (preparo_por_item_min between 0 and 60),
  constraint despacho_config_max_pedidos check (max_pedidos_corrida between 1 and 10),
  constraint despacho_config_janela check (janela_saida_min between 0 and 120),
  constraint despacho_config_desvio check (desvio_max_min between 0 and 120),
  constraint despacho_config_velocidade check (velocidade_media_kmh between 5 and 120),
  constraint despacho_config_origem_junta check ((origem_lat is null) = (origem_lng is null)),
  constraint despacho_config_origem_lat check (origem_lat is null or origem_lat between -90 and 90),
  constraint despacho_config_origem_lng check (origem_lng is null or origem_lng between -180 and 180)
);

create trigger trg_despacho_config_atualizado_em before update on public.despacho_config
  for each row execute function public.tocar_atualizado_em();

alter table public.despacho_config enable row level security;
grant select, insert, update on public.despacho_config to whaviso_api;
create policy api_despacho_config on public.despacho_config for all to whaviso_api using (true) with check (true);

-- ------------------------------------------------------------------ geocode em enderecos
alter table public.enderecos add column if not exists geocode_falha_em timestamptz;

-- Zera a geocodificacao quando o texto do endereco muda sem que a mesma instrucao esteja gravando
-- a coordenada (o geocode do modulo roteirizacao muda so lat/lng/geocodificado_em/geocode_falha_em).
create or replace function public.zerar_geocode_se_endereco_mudou()
returns trigger language plpgsql as $$
begin
  if (new.logradouro, new.numero, new.bairro, new.cidade, new.uf, new.cep)
       is distinct from (old.logradouro, old.numero, old.bairro, old.cidade, old.uf, old.cep)
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng
     and new.geocodificado_em is not distinct from old.geocodificado_em then
    new.lat := null;
    new.lng := null;
    new.geocodificado_em := null;
    new.geocode_falha_em := null;
  end if;
  return new;
end;
$$;

create trigger trg_enderecos_zerar_geocode before update on public.enderecos
  for each row execute function public.zerar_geocode_se_endereco_mudou();

-- Indice das pendentes de geocode ja existe (enderecos_sem_geocode, 0006).

-- Grants: o atendente deixa de ter privilegio de tabela em enderecos para inserir/atualizar; passa a ter
-- so as colunas de texto (insert) e `ultimo_uso_em` (update). Select segue de tabela inteira.
revoke insert, update on public.enderecos from whaviso_atendente;
grant insert (loja_id, cliente_id, apelido, logradouro, numero, complemento, bairro, cidade, uf, cep,
              referencia, ultimo_uso_em, ativo) on public.enderecos to whaviso_atendente;
grant update (ultimo_uso_em) on public.enderecos to whaviso_atendente;
