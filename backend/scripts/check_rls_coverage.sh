#!/usr/bin/env bash
# Cobertura de RLS (defesa em profundidade, M3): FALHA (exit != 0) se alguma tabela do
# schema public estiver SEM row level security. A protecao contra a anon key (publica no
# bundle do front) ler dados via PostgREST depende de RLS estar LIGADO em TODA tabela; este
# check quebra o build se uma tabela nova esquecer o `enable row level security`. Complementa
# a migration 0069 (revoke explicito de anon/authenticated).
#
# Uso local (Windows): bash scripts/check_rls_coverage.sh [banco]
#   (le POSTGRES_PASSWORD de ./.env; psql em PGBIN, padrao do PostgreSQL 18 desta maquina)
# Uso no CI (Linux): psql do PATH e as vars PG* do ambiente do job.
set -euo pipefail

cd "$(dirname "$0")/.."

# .env local (Windows) traz POSTGRES_PASSWORD. No CI nao existe: usa POSTGRES_PASSWORD/PGPASSWORD do ambiente.
if [ -f ./.env ]; then
  set -a; . ./.env; set +a
fi
# Deriva a senha fora do bloco do .env: no CI (sem .env) a senha vem do ambiente do job.
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGCLIENTENCODING=UTF8

DB="${1:-${PGDATABASE:-whaviso_dev}}"
HOST="${PGHOST:-127.0.0.1}"
USR="${PGUSER:-postgres}"

# psql: nesta maquina o binario tem espaco no caminho (PGBIN); no CI/Linux vem do PATH.
WINPSQL="${PGBIN:-/c/Program Files/PostgreSQL/18/bin}/psql.exe"
if [ -x "$WINPSQL" ]; then
  psql() { "$WINPSQL" -h "$HOST" -U "$USR" "$@"; }
else
  psql() { command psql -h "$HOST" -U "$USR" "$@"; }
fi

echo ">> cobertura de RLS em '$DB' (schema public)"

# Tabelas base ('r') e particionadas ('p') do public com RLS DESLIGADO.
faltantes=$(psql -Atq -d "$DB" -c "
  select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r','p')
     and c.relrowsecurity = false
   order by c.relname;
" | tr -d '\r')

if [ -n "$faltantes" ]; then
  echo "FALHA: tabelas em public SEM row level security:" >&2
  printf '  - %s\n' $faltantes >&2
  echo "Ligue com: alter table public.<tabela> enable row level security;" >&2
  exit 1
fi

echo ">> OK: todas as tabelas de public tem RLS habilitado"

# (b) GRANT a anon/authenticated/public em tabela do public. O RLS so vale como defesa se o teto
# (o GRANT) tambem estiver fechado para esses roles: a anon key e publica no bundle do front. A 0001
# revoga o teto e o default privileges, mas uma migration nova pode reconceder por engano. Este check
# le os ACLs reais (pg_class.relacl via aclexplode) e FALHA se achar qualquer privilegio concedido a
# anon, authenticated ou PUBLIC (grantee oid 0) em tabela base/particionada do public.
echo ">> grants a anon/authenticated/public em '$DB' (schema public)"
grants_proibidos=$(psql -Atq -d "$DB" -c "
  select c.relname || ' -> ' || coalesce(r.rolname, 'PUBLIC') || ' (' || a.privilege_type || ')'
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
    left join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public'
     and c.relkind in ('r','p')
     and (a.grantee = 0 or r.rolname in ('anon','authenticated'))
   order by 1;
" | tr -d '\r')

if [ -n "$grants_proibidos" ]; then
  echo "FALHA: grants a anon/authenticated/PUBLIC em tabelas de public:" >&2
  printf '%s\n' "$grants_proibidos" | sed 's/^/  - /' >&2
  echo "Revogue com: revoke all on public.<tabela> from anon, authenticated, public;" >&2
  exit 1
fi

echo ">> OK: nenhuma tabela de public concede privilegio a anon/authenticated/public"

# (c) Policy de RLS que inclua anon/authenticated/public entre os roles. As policies devem valer so
# para os roles de servico (whaviso_api/zap/atendente); uma policy em anon/authenticated/public
# abriria a tabela para a anon key mesmo com o teto fechado. pg_policies.roles traz os nomes dos
# roles (ou {0}/'public' quando a policy vale para todos). FALHA se algum desses tres aparecer.
echo ">> policies de RLS para anon/authenticated/public em '$DB' (schema public)"
policies_proibidas=$(psql -Atq -d "$DB" -c "
  select tablename || ' -> ' || policyname || ' (' || array_to_string(roles, ',') || ')'
    from pg_policies
   where schemaname = 'public'
     and roles && array['anon','authenticated','public']::name[]
   order by 1;
" | tr -d '\r')

if [ -n "$policies_proibidas" ]; then
  echo "FALHA: policies de RLS que incluem anon/authenticated/public:" >&2
  printf '%s\n' "$policies_proibidas" | sed 's/^/  - /' >&2
  echo "Troque o role da policy para os roles de servico (whaviso_api/zap/atendente)." >&2
  exit 1
fi

echo ">> OK: nenhuma policy de RLS inclui anon/authenticated/public"
