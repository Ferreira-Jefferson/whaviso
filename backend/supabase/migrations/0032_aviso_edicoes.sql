-- E2 — H2.5: SUB-CICLO de edição com reaprovação. Snapshot das CONDIÇÕES ANTERIORES
-- para "desfazer" / "reativar nas condições anteriores", e contador de edições.
--
-- DECISÃO (tabela append-only, não coluna jsonb): `avisos_edicoes` é append-only,
-- alinhada à regra de não-DELETE/auditoria e ao "histórico de reedições" (limite por
-- plano, E11/G-C2). Cada linha guarda o SNAPSHOT dos dados ANTES da edição (para
-- desfazer/restaurar) e o status que vigorava. O CONTADOR de edições do aviso é
-- derivado de count(*) nesta tabela (G-C2): não há coluna redundante a manter em sync.
--
-- Por que snapshot do "antes" e não do "depois": ao editar um aviso já aceito, ele vai
-- para `aguardando_aprovacao_aviso_editado` com os NOVOS dados já gravados no `avisos`
-- (o que o devedor vai aprovar). O "antes" fica guardado aqui para desfazer/recusar
-- (voltar às condições anteriores). `resolvida_em`/`resolucao` fecham o ciclo de cada
-- edição (aprovada/recusada/desfeita) sem apagar a linha.
--
-- Numeração: última = 0031; esta é 0032.

create table if not exists public.avisos_edicoes (
  id bigint generated always as identity primary key,
  aviso_id uuid not null references public.avisos (id) on delete cascade,
  -- Snapshot das condições ANTERIORES (o que restaurar ao desfazer/recusar).
  dados_anteriores jsonb not null,
  -- Status que vigorava ANTES de ir para aguardando_aprovacao_aviso_editado
  -- (sempre 'programado' no caso pós-aceite; guardado para clareza/auditoria).
  status_anterior status_aviso not null,
  -- Fecho do sub-ciclo desta edição. null = ainda pendente de decisão do devedor.
  --   aprovada  -> devedor aprovou; aviso voltou a programado com os novos dados.
  --   recusada  -> devedor recusou; cobrador decide reativar-anterior ou reeditar.
  --   desfeita  -> cobrador desfez antes da decisão; voltou às condições anteriores.
  resolucao text check (resolucao in ('aprovada', 'recusada', 'desfeita')),
  resolvida_em timestamptz,
  criado_em timestamptz not null default now()
);

create index if not exists idx_avisos_edicoes_aviso on public.avisos_edicoes (aviso_id);
-- No máximo UMA edição pendente por aviso (o aviso só está em
-- aguardando_aprovacao_aviso_editado por uma edição de cada vez).
create unique index if not exists idx_avisos_edicoes_pendente
  on public.avisos_edicoes (aviso_id)
  where resolucao is null;

-- Grants no padrão da 0008: a api lê/escreve; sem DELETE (append-only); zap não acessa.
grant select, insert, update on public.avisos_edicoes to whaviso_api;
alter table public.avisos_edicoes enable row level security;
create policy api_avisos_edicoes on public.avisos_edicoes
  for all to whaviso_api using (true) with check (true);
