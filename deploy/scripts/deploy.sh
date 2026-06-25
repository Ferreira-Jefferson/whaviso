#!/usr/bin/env bash
# whaviso: deploy/atualizacao no VPS. Rode como root: sudo /opt/whaviso/deploy/scripts/deploy.sh
# Idempotente: puxa o main, instala deps, builda a SPA, publica e reinicia os servicos.
set -euo pipefail

APP=/opt/whaviso/app
WEBROOT=/var/www/whaviso
BRANCH="${1:-main}"
ENV_FILE=/etc/whaviso/whaviso.env

# ── Guarda da sessao do WhatsApp ──
# O deploy NUNCA apaga a sessao do Baileys: ela vive em WHATS_AUTH_DIR, fora deste
# checkout, e o restart reconecta por ela sem reescanear. O risco nao e o deploy
# apagar a sessao, e o env apontar para um caminho relativo/ausente: ai a sessao
# cairia dentro de /opt/whaviso/app (efemero) e o numero pediria QR novo a cada
# deploy. Esta guarda barra essa configuracao errada ANTES de mexer em qualquer
# coisa. No 1o boot (ainda sem sessao) ela so avisa e segue. Escape hatch para
# pular tudo: SKIP_WHATS_CHECK=1.
verificar_sessao_whatsapp() {
  if [ "${SKIP_WHATS_CHECK:-0}" = "1" ]; then
    echo ">> [aviso] checagem da sessao do WhatsApp pulada (SKIP_WHATS_CHECK=1)"
    return 0
  fi
  if [ ! -f "$ENV_FILE" ]; then
    echo ">> [ERRO] env de producao nao encontrado em $ENV_FILE" >&2
    exit 1
  fi
  local dir
  dir="$(sed -n 's/^[[:space:]]*WHATS_AUTH_DIR[[:space:]]*=[[:space:]]*//p' "$ENV_FILE" | tail -n1 | tr -d "\"'" | tr -d '\r')"
  if [ -z "$dir" ]; then
    echo ">> [ERRO] WHATS_AUTH_DIR nao esta definido em $ENV_FILE." >&2
    echo "          Sem ele a sessao do WhatsApp cai dentro do checkout (efemero) e o" >&2
    echo "          numero pede QR novo a cada deploy. Defina um caminho absoluto, ex.:" >&2
    echo "            WHATS_AUTH_DIR=/var/lib/whaviso/auth_baileys" >&2
    exit 1
  fi
  case "$dir" in
    /*) : ;;
    *)
      echo ">> [ERRO] WHATS_AUTH_DIR=\"$dir\" e relativo; precisa ser um caminho absoluto" >&2
      echo "          e persistente FORA do checkout (ex.: /var/lib/whaviso/auth_baileys)." >&2
      exit 1
      ;;
  esac
  if [ -f "$dir/creds.json" ]; then
    echo ">> sessao do WhatsApp presente em $dir (o restart reconecta sem QR)"
  else
    echo ">> [aviso] sem sessao salva em $dir (creds.json ausente):" >&2
    echo "           o zap vai subir SEM numero pareado e pedira um QR novo no painel." >&2
    echo "           Normal no 1o boot. Se voce JA tinha um numero conectado, cancele e" >&2
    echo "           investigue antes de seguir (a sessao pode ter sido perdida)." >&2
  fi
}

verificar_sessao_whatsapp

echo ">> atualizando o codigo (branch $BRANCH)"
cd "$APP"
git fetch --prune origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"   # os segredos ficam em /etc/whaviso, nada se perde aqui

echo ">> backend: instalando deps (workspaces, sem build: roda via tsx)"
cd "$APP/backend"
npm ci

echo ">> frontend: instalando deps e buildando a SPA"
cd "$APP/frontend"
npm ci
npm run build

echo ">> publicando a SPA de forma atomica em $WEBROOT"
rm -rf "${WEBROOT}.new"
cp -r dist "${WEBROOT}.new"
rm -rf "${WEBROOT}.old"
[ -d "$WEBROOT" ] && mv "$WEBROOT" "${WEBROOT}.old"
mv "${WEBROOT}.new" "$WEBROOT"

# Sem chown: o codigo fica dono do root e o servico (whaviso) so LE. Isso evita o
# erro "dubious ownership" do git no proximo deploy (root rodando git num repo de
# outro dono) e deixa o app imutavel em runtime. O unico caminho que o zap escreve
# e /var/lib/whaviso (ReadWritePaths na unit), fora do checkout. O acesso de leitura
# do whaviso ao codigo vem de ele ser dono de /opt/whaviso (que e 750).

echo ">> reiniciando os servicos"
systemctl restart whaviso-api
systemctl restart whaviso-zap   # reconecta o WhatsApp pela sessao em disco (nao precisa reescanear)

echo ">> status"
systemctl --no-pager --lines=5 status whaviso-api whaviso-zap || true
echo ">> deploy concluido"
