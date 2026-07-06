#!/usr/bin/env bash
# whaviso: backup do banco Supabase cloud via pg_dump, rodando no VPS. Idempotente.
# Ja vem no checkout em /opt/whaviso/app/deploy/scripts/backup-db.sh e e disparado pelo
# whaviso-backup.timer (1x/dia). Ver a secao "Backups do banco" em deploy/README.md.
#
# POR QUE EXISTE: o plano FREE do Supabase NAO tem backup nenhum (sem PITR, sem snapshot).
# Sem esta rotina o banco de producao fica sem rede de protecao. Aqui puxamos um dump
# proprio, de graca, e guardamos em /var/lib/whaviso/backups (fora do checkout, persiste
# entre deploys e reboots), com rotacao.
#
# ESCOPO DO DUMP: dump COMPLETO do banco (todos os schemas que o owner consegue ler), em
# formato custom (-Fc), que e o mais completo e restauravel. O dado critico e nao
# reconstruivel do whaviso vive em dois schemas: `public` (tabelas de negocio) e `auth`
# (usuarios do Supabase Auth); o whaviso so usa esses dois (Supabase = Postgres + Auth,
# sem Storage/Realtime/Edge). Se algum dia o dump completo reclamar de um schema gerenciado
# do Supabase que o owner nao le por inteiro (raro; ex.: `vault`/`pgsodium`), limite o
# escopo setando BACKUP_PG_DUMP_ARGS="-n public -n auth" no /etc/whaviso/backup.env: isso
# ainda captura 100% do que e do whaviso. O formato custom permite restaurar tudo ou so
# parte (ver restore-db.sh).
#
# CONEXAO: BACKUP_DATABASE_URL tem que ser a do OWNER `postgres` (os roles de app
# whaviso_api/whaviso_zap sao de privilegio minimo e NAO leem tudo). Use o SESSION POOLER
# (IPv4, :5432) ou a conexao direta (IPv6). NUNCA o transaction pooler (:6543): ele nao
# suporta pg_dump direito. Detalhes em deploy/whaviso-backup.env.example.
#
# SENSIBILIDADE: o dump contem dado sensivel (telefones, Pix, hashes de token). Diretorio
# 700, arquivos 600, e se BACKUP_REMOTE_CMD mandar para fora, o destino tem que ser privado
# e idealmente criptografado. (A conn string vai no argv do pg_dump; neste VPS so root e o
# sudoer deploy tem shell, e ambos ja podem ler o backup.env 600, entao nao ha exposicao
# alem de quem ja tem acesso.)
set -euo pipefail

# Qualquer arquivo criado nasce 600 e diretorio 700 (o dump e segredo).
umask 077

# ── Configuracao (vem do EnvironmentFile /etc/whaviso/backup.env) ──
BACKUP_DIR="${BACKUP_DIR:-/var/lib/whaviso/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
BACKUP_REMOTE_CMD="${BACKUP_REMOTE_CMD:-}"
BACKUP_PG_DUMP_ARGS="${BACKUP_PG_DUMP_ARGS:-}"

log() { echo "[backup-db] $*"; }

# Retencao tem que ser inteiro nao negativo; se vier lixo, cai no default.
case "$BACKUP_RETENTION_DAYS" in
  ''|*[!0-9]*)
    log "BACKUP_RETENTION_DAYS invalido ('$BACKUP_RETENTION_DAYS'); usando 14"
    BACKUP_RETENTION_DAYS=14
    ;;
esac

# pg_restore (mesma versao do pg_dump) valida a integridade do arquivo no fim. Deriva do
# diretorio do PG_DUMP_BIN quando ele e um caminho versionado; senao usa o do PATH.
if [ -z "${PG_RESTORE_BIN:-}" ]; then
  case "$PG_DUMP_BIN" in
    */*) PG_RESTORE_BIN="$(dirname "$PG_DUMP_BIN")/pg_restore" ;;
    *)   PG_RESTORE_BIN="pg_restore" ;;
  esac
fi

# ── Validacao ──
if [ -z "${BACKUP_DATABASE_URL:-}" ]; then
  log "ERRO: BACKUP_DATABASE_URL ausente (ver /etc/whaviso/backup.env). Abortando."
  exit 1
fi
command -v "$PG_DUMP_BIN" >/dev/null 2>&1 || {
  log "ERRO: pg_dump nao encontrado em '$PG_DUMP_BIN'. Instale o postgresql-client compativel"
  log "      com a versao do servidor (ver deploy/README.md, secao Backups do banco). Abortando."
  exit 1
}

# ── Preparacao ──
install -m 700 -d "$BACKUP_DIR"

# Timestamp no fuso de negocio (America/Sao_Paulo); o banco esta em UTC, mas o nome do
# arquivo segue o horario local para leitura humana.
stamp="$(TZ='America/Sao_Paulo' date +'%Y%m%d-%H%M%S')"
final="$BACKUP_DIR/whaviso-$stamp.dump"
tmp="$BACKUP_DIR/.whaviso-$stamp.dump.partial"

# Se sobrou um parcial de uma execucao morta, remove antes.
rm -f "$tmp"

log "iniciando dump (formato custom) do banco -> $final"

# ── Dump ──
# -Fc: formato custom comprimido (permite restauracao seletiva no pg_restore).
# -w : nunca pede senha interativa (job nao interativo); a senha vem na URL.
# BACKUP_PG_DUMP_ARGS: escape hatch para limitar schemas, ex.: "-n public -n auth".
# Escreve no arquivo .partial; so vira o nome final apos validar (dump atomico).
# shellcheck disable=SC2086
"$PG_DUMP_BIN" -Fc -w $BACKUP_PG_DUMP_ARGS -f "$tmp" -d "$BACKUP_DATABASE_URL"

# ── Verificacao (nunca promover um dump vazio ou corrompido) ──
if [ ! -s "$tmp" ]; then
  log "ERRO: dump vazio ou inexistente. Abortando sem promover."
  rm -f "$tmp"
  exit 1
fi
# pg_restore --list le o indice do archive custom: se estiver corrompido, falha aqui.
if ! "$PG_RESTORE_BIN" --list "$tmp" >/dev/null 2>&1; then
  log "ERRO: o arquivo nao e um archive custom valido (pg_restore --list falhou). Abortando."
  rm -f "$tmp"
  exit 1
fi

# ── Promocao atomica: so agora o dump valido vira o nome final ──
chmod 600 "$tmp"
mv -f "$tmp" "$final"
size="$(du -h "$final" | cut -f1)"
log "dump concluido e validado: $final ($size)"

# ── Envio para fora da maquina (opcional) ──
# BACKUP_REMOTE_CMD recebe o caminho do dump como ULTIMO argumento E na variavel de
# ambiente BACKUP_FILE. Ex.: BACKUP_REMOTE_CMD="rclone copy" -> `rclone copy <arquivo>`.
# Se o envio falhar, o job inteiro falha (set -e) para o systemd marcar failed.
if [ -n "$BACKUP_REMOTE_CMD" ]; then
  log "enviando o dump para fora da maquina (BACKUP_REMOTE_CMD)"
  BACKUP_FILE="$final" sh -c "$BACKUP_REMOTE_CMD \"\$1\"" whaviso-backup "$final"
  log "envio remoto concluido"
fi

# ── Rotacao: apaga dumps mais antigos que BACKUP_RETENTION_DAYS ──
if [ "$BACKUP_RETENTION_DAYS" -gt 0 ]; then
  log "rotacao: removendo dumps com mais de $BACKUP_RETENTION_DAYS dia(s)"
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'whaviso-*.dump' \
    -mtime +"$BACKUP_RETENTION_DAYS" -print -delete
  # Limpa tambem parciais orfaos (de execucoes que morreram no meio).
  find "$BACKUP_DIR" -maxdepth 1 -type f -name '.whaviso-*.dump.partial' \
    -mtime +1 -print -delete
else
  log "rotacao desabilitada (BACKUP_RETENTION_DAYS=$BACKUP_RETENTION_DAYS)"
fi

log "backup OK"
