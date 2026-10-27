# Banco de dados do rebuild: diagnóstico, schema novo e reset (proposta)

> **Status:** proposta, para o dono revisar e aprovar antes de apagar migrations e resetar o banco.
> **Data:** 2026-10-27. Produto novo: pedidos de restaurante por WhatsApp.
> **Base:** as 103 migrations atuais (`backend/supabase/migrations/`), o seed, o spec do produto,
> `INVENTARIO.md` e `ARQUITETURA.md`, e as convenções do `CLAUDE.md`.

## 1. Estado atual (snapshot, antes de apagar)

Todo o schema de hoje é de **cobrança**. Grupos:

- **Negócio de cobrança (sai quase tudo):** `avisos` (agregado central, máquina de estados por
  trigger) + satélites `eventos_aviso`, `avisos_edicoes`, `avisos_reportes`, `aviso_ocorrencias`,
  `aviso_categorias`, `sessao_cadastro_pix`; catálogo do revendedor `categorias`, `produtos`;
  view `combinado_linhas`.
- **Auth/perfil (adapta → base multi-tenant):** `profiles` (1:1 com `auth.users`, trigger
  `handle_new_user`), `chaves_pix`, `eventos_auth` (telefone só sha256).
- **Templates (adapta → por loja):** `templates` (unificada por `chave`, `conteudo` jsonb, check
  de linguagem, status Meta).
- **Outbox/notificações (padrão aproveita):** `envios` (outbox dos lembretes, claim por índice
  parcial), `notificacoes_cobrador`, `notificacoes_billing`.
- **WhatsApp/webhook:** `whats_sessao`, `whats_teste_*` (Baileys, saem); `webhook_eventos_processados`
  (idempotência, aproveita o padrão).
- **Billing de cobrança (sai inteiro):** `planos`, `assinaturas`, `plano_versoes`, `pagamentos`,
  carteira de créditos (`creditos_*`), `billing_comprovantes`.
- **Config:** `config_plataforma` (singleton id=1, Pix da plataforma).

## 2. Diagnóstico

**O que sai:** praticamente todo o domínio (avisos + satélites, `envios` acoplado a `aviso_id`,
`notificacoes_*`, billing de créditos, `categorias`/`produtos` do revendedor, `whats_*` Baileys).
Sobra só o esqueleto de infra.

**Problemas do schema atual (lições para o novo):**
1. **Single-tenant por usuário**, não multi-loja. Tudo pendura em `profile_id`; não há Conta → Loja
   → Número nem papéis por loja.
2. **Outbox acoplada ao agregado** (`envios.aviso_id NOT NULL`, trigger que cancela por status do
   aviso). A nova deve ser genérica, roteada por `numero_whatsapp_id`.
3. **Config como singleton `id=1`.** No multi-tenant, Pix e branding são por loja.
4. **Catálogo plano e pobre** (`produtos` = nome+preço). O cardápio exige grupos de opções
   reutilizáveis (ponto de normalização mais sensível).
5. **Sprawl de 103 migrations** (muito ALTER aditivo, 3 reescritas da máquina de estados, billing
   re-modelado 4x). Confirma que começar baseline limpo é o certo.

**Padrões que valem manter (o ativo do esqueleto):**
- Roles de serviço de **privilégio mínimo** `whaviso_api`/`whaviso_zap`, **sem DELETE** em
  negócio/auditoria (exceção `templates`).
- **RLS deny-all** para anon/authenticated (RLS ligado em tudo + policies só para os roles de
  serviço; `REVOKE` + `ALTER DEFAULT PRIVILEGES`; coberto por `check_rls_coverage.sh`).
- **Grants por coluna na fronteira do outbox** (o `zap` só dá UPDATE nas colunas que escreve).
- **Outbox com claim** `FOR UPDATE SKIP LOCKED` + índice parcial de "due".
- **Auditoria append-only** (trigger que rejeita UPDATE, sem grant de DELETE).
- **Idempotência de webhook** (reivindicar `wamid` com `INSERT ON CONFLICT DO NOTHING`).
- **Dinheiro em centavos**, `timestamptz` em UTC, datas de negócio em America/Sao_Paulo no servidor.
- **Token/telefone sensível só como sha256**; PII nunca em claro nem em jsonb de auditoria.
- Catálogo em **migration (upsert)**, não no seed (o seed não roda no cloud).

## 3. Schema novo (restaurante, normalizado, multi-tenant)

**Scoping:** Conta → Lojas → Números. Toda tabela de loja carrega `loja_id`; as da conta, `conta_id`.
RLS mantém o padrão (deny-all para anon/authenticated; policies só para roles de serviço `using(true)`),
e o **escopo por loja é imposto pelo kernel de tenant da api** (resolve o membership → injeta
`WHERE loja_id = ANY(lojas_do_usuario)`). Hardening opcional: RLS real por loja via GUC
(`SET LOCAL app.loja_id` + policy), como defesa em profundidade.

**Terceiro role de serviço `whaviso_atendente`** (worker de IA): lê cardápio/clientes/rotas/base,
insere `mensagens` e rascunho de `pedidos`, enfileira em `envios`; não toca billing nem credenciais Meta.

**Tabelas (resumo):**
- **Núcleo:** `contas`, `lojas` (branding/horários/área), `membros` (papel dono/gerente/atendente,
  `loja_id` NULL = todas as lojas da conta), `numeros_whatsapp` (unique em `phone_number_id`, token
  do Embedded Signup criptografado, número só como hash).
- **Cardápio (eixo de normalização):** `grupos_opcoes` (tipo tamanho/adicional/customizado; modela as
  "seções personalizáveis": lista de valores, preço opcional, obrigatória/opcional, limite, default),
  `opcoes` (valores do grupo, preço em centavos, `padrao`, `esgotado_ate`), `categorias`
  (programação por dia/horário), `categoria_grupos` (M:N: seções da categoria, herdadas pelos itens),
  `itens` (herda da categoria; `sugerivel` = "quer adicionar?"), `item_grupos` (override por exceção).
  Addon dependente de tamanho via `grupos_opcoes.aplica_a_opcao_id`. Liga/desliga = `ativo` +
  `esgotado_ate` (o "esgotado hoje" volta sozinho).
- **Pedidos (kanban):** `pedidos` (status novo→em_preparo→saiu_entrega→entregue→problema; origem
  whatsapp/ifood/manual; totais em centavos), `itens_pedido` (**snapshot** de nome/preço no momento),
  `itens_pedido_opcoes` (modificadores, também em snapshot).
- **Conversas:** `conversas` (status ia/humano/encerrada, handoff humano), `mensagens` (direção,
  tipo texto/áudio/imagem, transcrição, wamid).
- **Clientes:** `clientes` (por loja, telefone só hash, unique `(loja_id, telefone_hash)`),
  `enderecos` (base do "repetir último / sugerir último endereço").
- **Entrega:** `rotas` (bairro/distância/área, taxa do cliente e valor do motoboy), `motoboys`,
  `fechamentos` (dia marcável como pago), `motoboy_lancamentos` (append-only).
- **Pagamentos:** `pagamentos` (Pix na conversa, BR Code/txid, status). Pix por loja.
- **Templates:** `templates` com `loja_id` NULL = padrão da plataforma (herdado), preenchido =
  sobrescrita da loja (branding). Mantém jsonb estruturado e check de linguagem.
- **Outbox genérica:** `envios` **desacoplada** (referências opcionais a pedido/conversa, roteada por
  `numero_whatsapp_id`), `webhook_eventos_processados` (idempotência, reaproveitada).
- **Eventos:** `eventos` (append-only genérico, sem PII), `eventos_auth` (mantido como hoje).
- **Billing:** `assinaturas` (por loja, ~R$700/mês, status ativa/suspensa/cancelada/trial), `faturas`.
- **RAG:** `base_conhecimento` (embedding `pgvector`, aprovado pelo dono) + `cache_semantico`; dados
  sempre-ao-vivo (preço/disponibilidade/status) nunca saem do cache.

### DDL esboçada das tabelas centrais

```sql
create type papel_membro  as enum ('dono','gerente','atendente');
create type status_numero as enum ('conectado','pausado','removido');
create type status_pedido as enum ('novo','em_preparo','saiu_entrega','entregue','problema');
create type tipo_grupo    as enum ('tamanho','adicional','customizado');
create type status_envio  as enum ('agendado','processando','enviado','falhou','cancelado');

create table public.contas (
  id uuid primary key default gen_random_uuid(),
  dono_user_id uuid not null references auth.users (id) on delete restrict,
  nome text not null,
  criado_em timestamptz not null default now()
);
create table public.lojas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas (id) on delete cascade,
  nome text not null, logo_url text,
  cores jsonb not null default '{}'::jsonb,            -- branding (painel + cardápio)
  endereco jsonb, horarios jsonb, area_entrega jsonb,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table public.membros (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas (id) on delete cascade,
  loja_id  uuid references public.lojas (id) on delete cascade,  -- NULL = todas as lojas
  user_id  uuid not null references auth.users (id) on delete cascade,
  papel    papel_membro not null,
  criado_em timestamptz not null default now()
);
create unique index membros_user_loja on public.membros (user_id, loja_id);

create table public.numeros_whatsapp (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  phone_number_id text not null,     -- id Meta, roteia o inbound
  waba_id text not null,
  numero_hash text,                  -- sha256, nunca o número em claro
  token_cifrado bytea,               -- token do Embedded Signup, criptografado
  status status_numero not null default 'conectado',
  verificado boolean not null default false,
  criado_em timestamptz not null default now()
);
create unique index numeros_phone_number_id on public.numeros_whatsapp (phone_number_id);

create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  cliente_id uuid references public.clientes (id),
  conversa_id uuid references public.conversas (id),
  numero_whatsapp_id uuid references public.numeros_whatsapp (id),
  codigo text not null,
  status status_pedido not null default 'novo',
  subtotal_centavos integer not null,
  taxa_entrega_centavos integer not null default 0,
  total_centavos integer not null,
  rota_id uuid references public.rotas (id),
  motoboy_id uuid references public.motoboys (id),
  endereco_id uuid references public.enderecos (id),
  problema_motivo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index pedidos_kanban on public.pedidos (loja_id, status, criado_em);

create table public.envios (                      -- outbox genérica (api/atendente enfileira, zap drena)
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references public.lojas (id) on delete cascade,
  numero_whatsapp_id uuid not null references public.numeros_whatsapp (id),
  destinatario_hash text, template_chave text, payload jsonb not null,
  pedido_id uuid references public.pedidos (id),
  conversa_id uuid references public.conversas (id),
  status status_envio not null default 'agendado',
  agendado_para timestamptz not null default now(),
  enviado_em timestamptz, tentativas smallint not null default 0,
  proxima_tentativa_em timestamptz, wamid text, entrega_status entrega_status, erro text,
  criado_em timestamptz not null default now()
);
create index envios_due on public.envios (agendado_para) where status in ('agendado','processando');
```

### RLS + grants (padrão por tabela de loja)

```sql
alter table public.pedidos enable row level security;
-- api: dona do dado do painel (sem DELETE)
grant select, insert, update on public.pedidos to whaviso_api;
create policy api_pedidos on public.pedidos for all to whaviso_api using (true) with check (true);
-- atendente (IA): lê cardápio/clientes/rotas, cria pedido/mensagem
grant select, insert, update on public.pedidos to whaviso_atendente;
create policy atendente_pedidos on public.pedidos for all to whaviso_atendente using (true) with check (true);
-- zap: só transporta; UPDATE por coluna na outbox
grant update (status, enviado_em, wamid, erro, proxima_tentativa_em, tentativas, entrega_status)
  on public.envios to whaviso_zap;
```
O escopo por loja (`WHERE loja_id = ANY($lojas_do_usuario)`) é imposto pelo kernel de tenant da api;
auditoria = só `select, insert` + trigger que rejeita UPDATE, zero DELETE.

## 4. Plano de reset

### 4.1 Local (risco zero)
1. Apagar as 103 migrations e reescrever o `seed.sql`.
2. Baseline novo em poucas migrations temáticas: `0001_roles_rls` (com `REVOKE anon/authenticated` +
   `ALTER DEFAULT PRIVILEGES` cedo), `0002_contas_lojas_membros`, `0003_numeros_whatsapp`,
   `0004_cardapio`, `0005_pedidos`, `0006_conversas_clientes`, `0007_rotas_motoboys`,
   `0008_pagamentos_billing`, `0009_templates_envios_outbox`, `0010_eventos_auth`.
3. Validar com `bash scripts/validate_migrations.sh whaviso_dev` (recria de banco vazio, sem teardown)
   e `check_rls_coverage.sh`. `supabase db reset` mexe **só no local**, nunca no cloud.

### 4.2 Cloud (o ponto sensível)
O Supabase versiona migrations em `supabase_migrations.schema_migrations` (fora de `public`). Apagar
os arquivos locais **não desfaz** o que já está aplicado no cloud; o `db push` do baseline novo
colidiria com o schema de cobrança existente. É preciso **zerar o cloud** antes do primeiro push.

Caminho recomendado: **`DROP SCHEMA public CASCADE` + recriar + re-grant + limpar o tracking.**
Preserva `auth`/`storage`/`extensions`, reconcilia o tracking, é manutenção única (não vira migration
permanente). `supabase db reset` não serve (local-only). Teardown-migration permanente contradiz o
baseline limpo. Reset do projeto é nuclear (perde `auth.users`, reconfigura tudo).

Ordem segura (sem cliente em produção, mas site/api/zap no ar):
1. **Confirmar o alvo** (projeto certo, session pooler 5432, de dentro de `backend/`). O drop é irreversível.
2. **Backup:** `pg_dump` do schema `auth` antes de qualquer drop (barato, salva de erro de alvo).
3. **Parar api/zap/atendente** (systemd) para não logar erro em loop; opcional página de manutenção
   (a SPA estática segue de pé).
4. **Wipe + recriar `public`** numa transação: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` +
   re-grants que o Supabase espera + recriar extensões em `public` (`pgcrypto`, `vector`) +
   `ALTER DEFAULT PRIVILEGES ... REVOKE ... FROM anon, authenticated`.
5. **Zerar o tracking:** `DELETE FROM supabase_migrations.schema_migrations;`.
6. **`supabase db push`** aplica o baseline. Catálogo (templates-base) via migration (upsert), não no seed.
7. **Deploy do código** novo e só então subir os serviços. Smoke test (`healthz`, inbound de teste).

**Timing:** o wipe mata o schema de que o código atual depende, então ele acontece na **mesma janela**
em que o backend novo já está pronto e validado localmente (4.1), nunca antes. Como não há cliente, a
janela pode ser curta; o que se protege é a continuidade do site e o fato de api/zap quebrarem
enquanto o `public` não existir.

### 4.3 Regra da casa
Todo commit com migrations novas/alteradas → **perguntar** ao dono se aplica no cloud (`db push`).
O wipe do cloud (4.2) é ação manual explícita, confirmada antes de executar.
