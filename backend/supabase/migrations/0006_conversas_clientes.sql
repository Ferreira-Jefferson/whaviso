-- Conversas, mensagens, clientes e endereços.
--
-- Telefone do cliente: nunca em claro. `telefone_hash` (sha256 do E.164) serve para achar e
-- deduplicar; `telefone_cifrado` (cifra da aplicação, mesma chave dos tokens) é o que permite
-- ao transporte responder ao cliente. Endereço de entrega é dado operacional e fica em claro,
-- mas nunca vai para log.

create type status_conversa as enum ('ia', 'humano', 'encerrada');
create type direcao_mensagem as enum ('entrada', 'saida');
create type tipo_mensagem as enum ('texto', 'audio', 'imagem', 'interativo', 'outro');
create type autor_mensagem as enum ('cliente', 'ia', 'humano', 'sistema');

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  telefone_hash text not null,
  telefone_cifrado bytea,
  nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint clientes_telefone_hash_fmt check (telefone_hash ~ '^[0-9a-f]{64}$')
);
create unique index clientes_loja_telefone on public.clientes (loja_id, telefone_hash);

create table public.enderecos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  apelido text,
  logradouro text not null,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf char(2),
  cep text,
  referencia text,
  lat numeric(9,6),                 -- geocodificação (ClienteMapas); NULL até geocodificar
  lng numeric(9,6),
  geocodificado_em timestamptz,
  ultimo_uso_em timestamptz,        -- base do "repetir / sugerir último endereço"
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint enderecos_lat_lng_juntos check ((lat is null) = (lng is null)),
  constraint enderecos_lat_faixa check (lat is null or lat between -90 and 90),
  constraint enderecos_lng_faixa check (lng is null or lng between -180 and 180)
);
create index enderecos_cliente on public.enderecos (cliente_id, ultimo_uso_em desc);
create index enderecos_loja on public.enderecos (loja_id);
create index enderecos_sem_geocode on public.enderecos (loja_id) where geocodificado_em is null;

create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  numero_whatsapp_id uuid not null references public.numeros_whatsapp (id),
  cliente_id uuid not null references public.clientes (id),
  status status_conversa not null default 'ia',
  atendido_por_membro_id uuid references public.membros (id),   -- quem assumiu no handoff humano
  humano_desde timestamptz,
  contexto jsonb not null default '{}'::jsonb,                  -- estado do fluxo (carrinho, etapa)
  ultima_entrada_em timestamptz,                                -- base da janela de 24h da Meta
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- No máximo uma conversa aberta por (número, cliente).
create unique index conversas_aberta_unica on public.conversas (numero_whatsapp_id, cliente_id)
  where status <> 'encerrada';
create index conversas_loja_status on public.conversas (loja_id, status, atualizado_em desc);
create index conversas_cliente on public.conversas (cliente_id);

create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  direcao direcao_mensagem not null,
  autor autor_mensagem not null,
  tipo tipo_mensagem not null default 'texto',
  conteudo text,
  transcricao text,                 -- áudio transcrito (STT)
  midia_ref text,                   -- id/chave da mídia, nunca o binário
  wamid text,                       -- id da mensagem na Meta
  criado_em timestamptz not null default now()
);
create index mensagens_conversa on public.mensagens (conversa_id, criado_em);
create unique index mensagens_wamid on public.mensagens (wamid) where wamid is not null;

create trigger trg_clientes_atualizado_em before update on public.clientes
  for each row execute function public.tocar_atualizado_em();
create trigger trg_enderecos_atualizado_em before update on public.enderecos
  for each row execute function public.tocar_atualizado_em();
create trigger trg_conversas_atualizado_em before update on public.conversas
  for each row execute function public.tocar_atualizado_em();

-- FKs que as tabelas acima fecham para pedidos (criado na 0005).
alter table public.pedidos
  add constraint pedidos_cliente_fk  foreign key (cliente_id)  references public.clientes (id),
  add constraint pedidos_conversa_fk foreign key (conversa_id) references public.conversas (id),
  add constraint pedidos_endereco_fk foreign key (endereco_id) references public.enderecos (id);

alter table public.clientes  enable row level security;
alter table public.enderecos enable row level security;
alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;

-- api: painel (conversas ao vivo, handoff, clientes). mensagens: só insert (resposta humana) e
--      leitura; a mensagem é registro imutável.
grant select, insert, update on public.clientes, public.enderecos, public.conversas to whaviso_api;
grant select, insert on public.mensagens to whaviso_api;

-- atendente: cria/ajusta cliente e endereço no atendimento, conduz a conversa, escreve mensagens.
grant select, insert, update on public.clientes, public.enderecos, public.conversas to whaviso_atendente;
grant select, insert on public.mensagens to whaviso_atendente;

-- zap: no inbound resolve o cliente e a conversa (achar ou criar) e grava a mensagem de entrada;
--      só atualiza o carimbo da janela de 24h.
grant select, insert on public.clientes, public.conversas, public.mensagens to whaviso_zap;
grant update (ultima_entrada_em) on public.conversas to whaviso_zap;

create policy api_clientes  on public.clientes  for all to whaviso_api using (true) with check (true);
create policy api_enderecos on public.enderecos for all to whaviso_api using (true) with check (true);
create policy api_conversas on public.conversas for all to whaviso_api using (true) with check (true);
create policy api_mensagens on public.mensagens for all to whaviso_api using (true) with check (true);

create policy atendente_clientes  on public.clientes  for all to whaviso_atendente using (true) with check (true);
create policy atendente_enderecos on public.enderecos for all to whaviso_atendente using (true) with check (true);
create policy atendente_conversas on public.conversas for all to whaviso_atendente using (true) with check (true);
create policy atendente_mensagens on public.mensagens for all to whaviso_atendente using (true) with check (true);

create policy zap_clientes  on public.clientes  for all to whaviso_zap using (true) with check (true);
create policy zap_conversas on public.conversas for all to whaviso_zap using (true) with check (true);
create policy zap_mensagens on public.mensagens for all to whaviso_zap using (true) with check (true);
