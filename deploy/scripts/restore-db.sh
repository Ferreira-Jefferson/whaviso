#!/usr/bin/env bash
# whaviso: restauracao de um dump gerado pelo backup-db.sh (formato custom -> pg_restore).
# Rode A MAO, com cuidado. NAO e chamado por nenhum timer. Companheiro do backup-db.sh e
# da secao "Backups do banco" em deploy/README.md.
#
# Por padrao este script so PREVIA: mostra o indice (TOC) do dump e o comando que rodaria,
# SEM tocar em banco nenhum. Passe --yes (e a RESTORE_DATABASE_URL) para restaurar de verdade.
# Rode com -h para reimprimir este guia.
#
# ===================== COMO RESTAURAR (passo a passo) =====================
# Um restore costuma acontecer meses depois, no susto. Leia os 6 passos inteiros
# antes de comecar; nunca pule os passos 3 a 5.
#
# 1) ESCOLHA O DUMP. Liste e pegue o mais recente (ou o da data desejada):
#      ls -la /var/lib/whaviso/backups
#    Os nomes sao whaviso-AAAAMMDD-HHMMSS.dump (horario America/Sao_Paulo).
#
# 2) PREVIA (nao toca em nada): confere que o indice lista as tabelas de public
#    (negocio) e auth (usuarios):
#      /opt/whaviso/app/deploy/scripts/restore-db.sh /var/lib/whaviso/backups/whaviso-AAAAMMDD-HHMMSS.dump
#
# 3) NAO restaure por cima da PRODUCAO. O restore e destrutivo (--clean derruba os
#    objetos existentes). Crie um destino NOVO e vazio para conferir primeiro: um
#    projeto Supabase novo, ou um banco Postgres limpo. Pegue a connection string do
#    OWNER `postgres` do destino (Session pooler 5432, ou conexao direta IPv6).
#
# 4) RESTAURE no destino novo (precisa de --yes E da RESTORE_DATABASE_URL do destino):
#      RESTORE_DATABASE_URL="postgresql://postgres.<ref>:<SENHA>@aws-1-us-east-1.pooler.supabase.com:5432/postgres" \
#        /opt/whaviso/app/deploy/scripts/restore-db.sh --yes /var/lib/whaviso/backups/whaviso-AAAAMMDD-HHMMSS.dump
#    Se o pg_restore nao estiver no PATH, aponte o binario versionado (o script deriva o
#    pg_restore do mesmo diretorio do PG_DUMP_BIN):
#      PG_DUMP_BIN=/usr/lib/postgresql/17/bin/pg_dump  (prefixe na mesma linha)
#
# 5) CONFIRA o destino antes de confiar nele: contagem das tabelas principais e um
#    spot-check dos dados mais recentes. Ex.:
#      psql "<RESTORE_DATABASE_URL>" -c "select count(*) from public.avisos;"
#
# 6) SO ENTAO PROMOVA: aponte o app para o destino restaurado (troque as connection
#    strings em /etc/whaviso/api.env e zap.env) e reinicie:
#      systemctl restart whaviso-api whaviso-zap
#    Se restaurou no mesmo projeto, apenas valide o app.
# ==========================================================================
#
# RESTAURAR SO PARTE: use RESTORE_PG_RESTORE_ARGS (ex.: "-n public" so o schema de
# negocio, "-t public.avisos" so uma tabela, ou "--data-only" so os dados). Veja o
# indice na previa (passo 2) antes de escolher.
#
# AVISOS:
#   - --clean --if-exists DERRUBA os objetos existentes no destino antes de recriar.
#   - Use o OWNER `postgres` no destino (RESTORE_DATABASE_URL): precisa recriar objetos.
#   - SESSION POOLER (:5432) ou conexao direta (IPv6); NUNCA o transaction pooler (:6543).
#   - pg_restore tem que ser >= a versao do servidor de ORIGEM do dump (aqui: Postgres 17).
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
