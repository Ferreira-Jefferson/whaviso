#!/usr/bin/env bash
# SEC-025 (sem service_role no bundle): FALHA (exit != 0) se o build do frontend (frontend/dist)
# contiver a service_role, qualquer chave privada (META_*, *_KEY, SUPABASE_SERVICE_ROLE) ou uma
# sentinela de segredo em claro. So a anon key (publica) pode estar presente. O frontend segue
# standalone: este script so LE frontend/dist, nunca constroi nem importa nada do front.
#
# NUNCA imprime o segredo: em falha mostra so o arquivo e a contagem.
#
# Uso: bash scripts/check_bundle_secrets.sh [dir_dist]   (default ../frontend/dist)
# ATIVO so quando F6 ja produz build. Sem dist, sai 0 com aviso (o teste fica `todo`, ver
# backend/security/test/bundle.test.ts e harness.md etapa 10).
set -euo pipefail

cd "$(dirname "$0")/.."

DIST="${1:-../frontend/dist}"
PREFIXO="${SENTINELA_PREFIXO:-WHV_SENTINEL_}"

if [ ! -d "$DIST" ]; then
  echo ">> aviso: '$DIST' ausente (F6 ainda nao produz build); nada a verificar." >&2
  exit 0
fi

# Padroes de segredo que NUNCA podem aparecer no bundle publico.
# service_role: JWT do Supabase com \"role\":\"service_role\"; chaves privadas por nome.
PADROES='service_role|SUPABASE_SERVICE_ROLE|META_[A-Z_]*TOKEN|META_APP_SECRET|_SECRET|_PRIVATE_KEY'

achados=$(grep -rElZ -e "$PADROES" -e "$PREFIXO" "$DIST" 2>/dev/null | tr '\0' '\n' | tr -d '\r' || true)

if [ -n "$achados" ]; then
  n=$(printf '%s\n' "$achados" | grep -c . || true)
  echo "FALHA: segredo/chave privada em $n arquivo(s) do bundle (sem imprimir o valor):" >&2
  printf '  - %s\n' $achados >&2
  exit 1
fi

echo ">> OK: nenhuma service_role / chave privada / sentinela em '$DIST'"
