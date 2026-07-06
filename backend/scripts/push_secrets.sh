#!/usr/bin/env bash
# Empurra os segredos de produção (secrets/production.env) para os provedores via CLI.
# Uso: bash scripts/push_secrets.sh <vercel|api|zap>
#
#   vercel  → envia as vars NEXT_PUBLIC_* para o projeto Vercel do frontend
#             (rode dentro da pasta do app frontend, já com `vercel link` feito)
#   api/zap → host ainda não definido: lista as chaves a configurar no env do host
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

# Lê o valor de uma chave do arquivo de secrets (ignora comentários).
val() { grep -E "^$1=" "$SECRETS_FILE" | head -1 | cut -d= -f2-; }

push_vercel() {
  command -v vercel >/dev/null 2>&1 || { echo "✗ Vercel CLI ausente: npm i -g vercel && vercel login" >&2; exit 1; }
  [[ -f .vercel/project.json ]] || {
    echo "✗ Projeto Vercel não linkado no diretório atual." >&2
    echo "  Rode este script na pasta do frontend, após 'vercel link'." >&2
    exit 1
  }
  local keys=(VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_API_URL)
  local v
  for ambiente in production preview development; do
    for k in "${keys[@]}"; do
      v="$(val "$k")"
      if [[ -z "$v" ]]; then echo "  ~ $k vazio, pulando ($ambiente)"; continue; fi
      vercel env rm "$k" "$ambiente" -y >/dev/null 2>&1 || true
      printf '%s' "$v" | vercel env add "$k" "$ambiente" >/dev/null
      echo "  ✓ $k → vercel:$ambiente"
    done
  done
  echo "Pronto. Refaça o deploy para as vars valerem: vercel --prod"
}

list_host_keys() {
  echo "Host de '$1' ainda não definido. Configure estas chaves no env do host (valores em $SECRETS_FILE):"
  shift
  for k in "$@"; do echo "  - $k"; done
}

case "$TARGET" in
  vercel) push_vercel ;;
  api)    list_host_keys api API_DATABASE_URL SUPABASE_URL APP_URL ;;
  zap)    list_host_keys zap ZAP_DATABASE_URL META_ACCESS_TOKEN META_PHONE_NUMBER_ID META_WABA_ID META_APP_SECRET META_VERIFY_TOKEN META_GRAPH_URL META_API_VERSION ;;
  *)      echo "Uso: bash scripts/push_secrets.sh <vercel|api|zap>" >&2; exit 1 ;;
esac
