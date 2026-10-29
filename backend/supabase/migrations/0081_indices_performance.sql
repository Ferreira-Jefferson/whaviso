-- Indices de performance para filtro por janela de tempo e busca por texto. Com banco vazio nao
-- pesa; com volume, pesa. Cada indice abaixo cobre uma consulta quente que hoje faz scan:
--   pedidos_loja_tempo        -> dashboard/repo.ts:52,80,107 e relatorios/repo.ts:261,307 (serie por loja+tempo, fora de rascunho)
--   movimentos_caixa_loja_tempo -> relatorios/repo.ts:231 (agregacao de caixa por loja+tipo+tempo)
--   comandas_loja_fechada     -> relatorios/repo.ts:156,171 (comandas fechadas por loja no periodo)
--   conversas_loja_atualizado -> conversas/repo.ts:80 (aba "todas", ordena por atualizado_em desc)
--   clientes_nome_trgm        -> busca ILIKE em clientes/repo.ts:33, conversas/repo.ts:72, plataforma_clientes/repo.ts:67
-- Todos usam IF NOT EXISTS para serem idempotentes (o db push pode reaplicar). Nao e necessario
-- grant: indice nao concede privilegio. No cloud, estes criam rapido porque as tabelas estao quase vazias.
create index if not exists pedidos_loja_tempo
  on public.pedidos (loja_id, criado_em)
  where status <> 'rascunho';

create index if not exists movimentos_caixa_loja_tempo
  on public.movimentos_caixa (loja_id, tipo, criado_em);

create index if not exists comandas_loja_fechada
  on public.comandas (loja_id, fechada_em)
  where status = 'fechada';

create index if not exists conversas_loja_atualizado
  on public.conversas (loja_id, atualizado_em desc, id desc);

create extension if not exists pg_trgm;

create index if not exists clientes_nome_trgm
  on public.clientes using gin (nome gin_trgm_ops);
