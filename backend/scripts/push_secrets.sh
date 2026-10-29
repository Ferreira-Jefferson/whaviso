#!/usr/bin/env bash
# Empurra os segredos de produção (secrets/production.env) para os provedores via CLI.
# Uso: bash scripts/push_secrets.sh <api|zap>
#
#   api/zap → lista as chaves a configurar no env do host (VPS: /etc/whaviso/*.env)
#
# Observação: o projeto NÃO usa Supabase Edge Functions, então não há
# `supabase secrets set` aqui: o único segredo do lado Supabase é a senha
# dos roles, que vive no Postgres (definida via ALTER ROLE / dashboard).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS_FILE="$ROOT/secrets/production.env"
TARGET="${1:-}"

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "✗ $SECRETS_FILE não existe. Copie secrets/production.env.example e preencha." >&2
  exit 1
fi

list_host_keys() {
  echo "Host de '$1' ainda não definido. Configure estas chaves no env do host (valores em $SECRETS_FILE):"
  shift
  for k in "$@"; do echo "  - $k"; done
}

case "$TARGET" in
  api)    list_host_keys api API_DATABASE_URL SUPABASE_URL APP_URL ;;
  zap)    list_host_keys zap ZAP_DATABASE_URL META_ACCESS_TOKEN META_PHONE_NUMBER_ID META_WABA_ID META_APP_SECRET META_VERIFY_TOKEN META_GRAPH_URL META_API_VERSION ;;
  *)      echo "Uso: bash scripts/push_secrets.sh <api|zap>" >&2; exit 1 ;;
esac
