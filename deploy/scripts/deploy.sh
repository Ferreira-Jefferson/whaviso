#!/usr/bin/env bash
# whaviso: deploy/atualizacao no VPS. Rode como root: sudo /opt/whaviso/deploy/scripts/deploy.sh
# Idempotente: puxa o main, instala deps, builda a SPA, publica e reinicia os servicos.
set -euo pipefail

APP=/opt/whaviso/app
WEBROOT=/var/www/whaviso
BRANCH="${1:-main}"

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
systemctl restart whaviso-zap   # reconecta a Meta Cloud API pelas credenciais (META_*)

echo ">> status"
systemctl --no-pager --lines=5 status whaviso-api whaviso-zap || true
echo ">> deploy concluido"
