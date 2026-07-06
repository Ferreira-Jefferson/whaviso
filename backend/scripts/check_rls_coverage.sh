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

# .env local (Windows) traz POSTGRES_PASSWORD. No CI nao existe: usa PGPASSWORD do ambiente.
if [ -f ./.env ]; then
  set -a; . ./.env; set +a
  export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
fi
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
