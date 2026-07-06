#!/usr/bin/env bash
# whaviso: restauracao de um dump gerado pelo backup-db.sh (formato custom -> pg_restore).
# Rode A MAO, com cuidado. NAO e chamado por nenhum timer. Ver a secao "Backups do banco"
# em deploy/README.md.
#
# Por padrao este script so PREVIA: mostra o indice (TOC) do dump e o comando que rodaria,
# SEM tocar no banco. Passe --yes para restaurar de verdade.
#
# USO:
#   # previa (nao toca em nada): so precisa do arquivo
#   /opt/whaviso/app/deploy/scripts/restore-db.sh /var/lib/whaviso/backups/whaviso-YYYYMMDD-HHMMSS.dump
#
#   # restauracao real (DESTRUTIVA no destino): exige RESTORE_DATABASE_URL e --yes
#   RESTORE_DATABASE_URL="postgresql://postgres.<ref>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres" \
#     /opt/whaviso/app/deploy/scripts/restore-db.sh --yes /var/lib/whaviso/backups/whaviso-YYYYMMDD-HHMMSS.dump
#
# AVISOS:
#   - O padrao usa --clean --if-exists: ele DERRUBA os objetos existentes no destino antes de
#     recriar. Restaurar por cima do banco de PRODUCAO e destrutivo. Para recuperar dados,
#     restaure primeiro num projeto/banco NOVO e limpo, confira, e so entao promova.
#   - Use o OWNER `postgres` no destino (RESTORE_DATABASE_URL): precisa recriar objetos.
#   - SESSION POOLER (:5432) ou conexao direta (IPv6); NUNCA o transaction pooler (:6543).
#   - Para restaurar so parte, use RESTORE_PG_RESTORE_ARGS (ex.: "-n public" so o schema de
#     negocio, ou "--data-only"). Veja o indice com a previa antes.
set -euo pipefail

PG_RESTORE_BIN="${PG_RESTORE_BIN:-}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
RESTORE_PG_RESTORE_ARGS="${RESTORE_PG_RESTORE_ARGS:-}"

log() { echo "[restore-db] $*"; }

# pg_restore: usa o do env, senao deriva do diretorio do PG_DUMP_BIN (client versionado),
# senao cai no do PATH.
if [ -z "$PG_RESTORE_BIN" ]; then
  case "$PG_DUMP_BIN" in
    */*) PG_RESTORE_BIN="$(dirname "$PG_DUMP_BIN")/pg_restore" ;;
    *)   PG_RESTORE_BIN="pg_restore" ;;
  esac
fi

# ── Argumentos ──
CONFIRMA=0
FILE=""
for arg in "$@"; do
  case "$arg" in
    --yes|-y) CONFIRMA=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) log "opcao desconhecida: $arg"; exit 2 ;;
    *)  FILE="$arg" ;;
  esac
done

if [ -z "$FILE" ]; then
  log "ERRO: informe o arquivo de dump. Ex.: restore-db.sh /var/lib/whaviso/backups/whaviso-YYYYMMDD-HHMMSS.dump"
  exit 2
fi
if [ ! -f "$FILE" ]; then
  log "ERRO: arquivo nao encontrado: $FILE"
  exit 2
fi
command -v "$PG_RESTORE_BIN" >/dev/null 2>&1 || {
  log "ERRO: pg_restore nao encontrado em '$PG_RESTORE_BIN'. Instale o postgresql-client"
  log "      compativel (ver deploy/README.md, secao Backups do banco). Abortando."
  exit 1
}

# ── Previa: indice do dump (nao toca em nenhum banco) ──
log "conteudo (TOC) do dump $FILE:"
"$PG_RESTORE_BIN" --list "$FILE"

# Flags do pg_restore na restauracao real:
# --clean --if-exists : derruba objetos existentes antes de recriar (DESTRUTIVO no destino).
# --no-owner --no-privileges : nao tenta reatribuir dono/ACL a roles que podem nao existir
#                              no destino (portabilidade entre projetos Supabase).
RESTORE_FLAGS="--clean --if-exists --no-owner --no-privileges"

if [ "$CONFIRMA" -ne 1 ]; then
  log ""
  log "PREVIA apenas: nada foi restaurado. Para restaurar de verdade (DESTRUTIVO), rode:"
  # shellcheck disable=SC2086
  log "  RESTORE_DATABASE_URL=... $0 --yes $FILE"
  log "Comando que seria executado:"
  # shellcheck disable=SC2086
  log "  $PG_RESTORE_BIN $RESTORE_FLAGS $RESTORE_PG_RESTORE_ARGS -d \"\$RESTORE_DATABASE_URL\" $FILE"
  exit 0
fi

# ── Restauracao real ──
if [ -z "${RESTORE_DATABASE_URL:-}" ]; then
  log "ERRO: RESTORE_DATABASE_URL ausente (owner postgres do destino, SESSION pooler 5432)."
  exit 1
fi

log "RESTAURANDO no destino (DESTRUTIVO: --clean --if-exists derruba objetos existentes)"
# shellcheck disable=SC2086
"$PG_RESTORE_BIN" $RESTORE_FLAGS $RESTORE_PG_RESTORE_ARGS -d "$RESTORE_DATABASE_URL" "$FILE"
log "restauracao concluida. Confira o banco antes de apontar o app para ele."
