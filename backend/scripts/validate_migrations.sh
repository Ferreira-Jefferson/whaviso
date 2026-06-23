#!/usr/bin/env bash
# Valida migrations + seed contra um Postgres local (sem Docker), usando um shim
# do schema `auth` do Supabase. Caminho canônico em ambiente completo: `supabase db reset`.
#
# Uso: POSTGRES_PASSWORD lido de ./.env; psql do PostgreSQL local no PATH ou em PGBIN.
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
export PGPASSWORD="$POSTGRES_PASSWORD" PGCLIENTENCODING=UTF8
PGBIN="${PGBIN:-/c/Program Files/PostgreSQL/18/bin}"
DB="${1:-whaviso_test}"
psql() { "$PGBIN/psql.exe" -h 127.0.0.1 -U postgres "$@"; }

echo ">> recriando banco $DB"
psql -d postgres -c "drop database if exists $DB;" >/dev/null
psql -d postgres -c "create database $DB;" >/dev/null

echo ">> shim auth + roles do Supabase"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f scripts/test_shim_auth.sql

echo ">> migrations"
for m in supabase/migrations/0*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$m"
  echo "   $(basename "$m") OK"
done

echo ">> seed"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/seed.sql
echo ">> pronto: $DB"
