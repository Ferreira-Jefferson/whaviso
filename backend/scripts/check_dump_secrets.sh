#!/usr/bin/env bash
# SEC-023 (cifrado em repouso): FALHA (exit != 0) se um pg_dump do banco contiver QUALQUER
# sentinela de segredo em TEXTO CLARO. As sentinelas carregam um prefixo unico e grep-avel
# (WHV_SENTINEL_, ver backend/security/fixtures/segredos.ts); valor real nunca entra aqui. Os
# segredos devem estar gravados so como cifra (bytea) + sha256; se o claro aparecer no dump, a
# cifra vazou e o build quebra.
#
# O script NUNCA imprime o segredo: em falha mostra so a CONTAGEM e os numeros de linha do dump.
#
# Uso local (Windows): bash scripts/check_dump_secrets.sh [banco]
#   (le POSTGRES_PASSWORD de ./.env; pg_dump em PGBIN, padrao do PostgreSQL 18 desta maquina)
# Uso no CI (Linux): pg_dump do PATH e as vars PG* do ambiente do job.
# Prefixo customizavel por SENTINELA_PREFIXO (default WHV_SENTINEL_).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f ./.env ]; then
  set -a; . ./.env; set +a
  export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
fi
export PGCLIENTENCODING=UTF8

DB="${1:-${PGDATABASE:-whaviso_dev}}"
HOST="${PGHOST:-127.0.0.1}"
USR="${PGUSER:-postgres}"
PREFIXO="${SENTINELA_PREFIXO:-WHV_SENTINEL_}"

# pg_dump: nesta maquina o binario tem espaco no caminho (PGBIN); no CI/Linux vem do PATH.
WINDUMP="${PGBIN:-/c/Program Files/PostgreSQL/18/bin}/pg_dump.exe"
if [ -x "$WINDUMP" ]; then
  pg_dump() { "$WINDUMP" -h "$HOST" -U "$USR" "$@"; }
else
  pg_dump() { command pg_dump -h "$HOST" -U "$USR" "$@"; }
fi

echo ">> dump de '$DB' procurando segredo em claro (prefixo '$PREFIXO')"

# Dump completo (schema + dados). grep -F (literal), -n (linha), sem imprimir o conteudo.
# `|| true` para o pipeline nao abortar por grep sem match (set -e + pipefail).
linhas=$(pg_dump --no-owner --no-privileges "$DB" | grep -nF "$PREFIXO" | cut -d: -f1 | tr -d '\r' || true)

if [ -n "$linhas" ]; then
  n=$(printf '%s\n' "$linhas" | grep -c . || true)
  echo "FALHA: $n ocorrencia(s) de segredo em CLARO no dump de '$DB'." >&2
  echo "Linhas do dump (sem imprimir o valor): $(printf '%s ' $linhas)" >&2
  echo "Um segredo sentinela apareceu em claro: a cifra em repouso vazou." >&2
  exit 1
fi

echo ">> OK: nenhum segredo em claro no dump de '$DB'"
