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
# Remove dotenvs antigos e gitignorados do front: o build usa o env exportado abaixo
# (precedencia maxima no Vite); um .env solto so causa confusao e ja envenenou o build
# uma vez (apontando para um Supabase deletado). O .env.example rastreado nao e tocado.
rm -f "$APP/frontend/.env" "$APP/frontend/.env.local" \
      "$APP/frontend/.env.production" "$APP/frontend/.env.production.local"
# As VITE_* sao assadas no bundle em build-time. Exportamos aqui (env de processo tem
# precedencia maxima no Vite) para o build NAO depender de nenhum .env solto no servidor:
# um .env gitignorado antigo ja envenenou o build uma vez, apontando para um projeto
# Supabase ja deletado, e deixou producao sem login. Fonte: /etc/whaviso/frontend.env se
# existir (root, fora do repo), senao o default versionado em deploy/ (valores publicos,
# ja embarcados na SPA). Falha o deploy se nenhum existir, em vez de assar um bundle quebrado.
FRONTEND_ENV=/etc/whaviso/frontend.env
[ -f "$FRONTEND_ENV" ] || FRONTEND_ENV="$APP/deploy/whaviso-frontend.env"
if [ ! -f "$FRONTEND_ENV" ]; then
  echo "ERRO: env de build do frontend nao encontrado ($FRONTEND_ENV)" >&2
  exit 1
fi
echo ">> frontend: env de build = $FRONTEND_ENV"
set -a; . "$FRONTEND_ENV"; set +a
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

echo ">> nginx: sincronizando a config do site (config-as-code) e recarregando"
# O deploy.sh roda como root (sudo), entao mantem /etc/nginx/sites-available/whaviso.conf
# igual ao versionado deploy/nginx/whaviso.conf. Defensivo: backup, nginx -t, e so recarrega
# se a config validar; se nao validar, restaura o backup. Isso elimina o drift (o servidor
# estava com um CSP mais antigo que o repo, sem accounts.google.com no style-src).
NGINX_SITE=/etc/nginx/sites-available/whaviso.conf
NGINX_SRC="$APP/deploy/nginx/whaviso.conf"
if [ -f "$NGINX_SRC" ]; then
  [ -f "$NGINX_SITE" ] && cp -f "$NGINX_SITE" "${NGINX_SITE}.bak.$(date +%s)"
  install -m 644 "$NGINX_SRC" "$NGINX_SITE"
  if nginx -t; then
    systemctl reload nginx
  else
    echo "AVISO: nginx -t falhou apos sincronizar; restaurando a config anterior" >&2
    last=$(ls -t "${NGINX_SITE}.bak."* 2>/dev/null | head -1)
    if [ -n "$last" ]; then cp -f "$last" "$NGINX_SITE" && nginx -t && systemctl reload nginx; fi
  fi
fi

echo ">> atendente: sincronizando a unit (config-as-code) e provisionando o env"
# O servico do atendente (motor IA/RAG :3003) entra como config-as-code, igual ao nginx: a unit
# vem do repo. O env de segredo (/etc/whaviso/atendente.env) e provisionado UMA vez a partir de um
# seed que o operador deixa em /home/deploy/atendente.env.seed (DATABASE_URL do role
# whaviso_atendente + PORT/LOG_LEVEL, SEM a MASTER_KEY) mais a MASTER_KEY lida do api.env/zap.env
# (fonte unica da chave mestra, sem drift). Instalado o env, o seed e destruido.
ATND_SRC="$APP/deploy/systemd/whaviso-atendente.service"
ATND_UNIT=/etc/systemd/system/whaviso-atendente.service
ATND_ENV=/etc/whaviso/atendente.env
ATND_SEED=/home/deploy/atendente.env.seed
if [ -f "$ATND_SRC" ]; then
  install -m 644 "$ATND_SRC" "$ATND_UNIT"
  if [ ! -f "$ATND_ENV" ] && [ -f "$ATND_SEED" ]; then
    echo ">> atendente: provisionando $ATND_ENV (seed + MASTER_KEY do api.env)"
    MK=$(grep -hE '^MASTER_KEY=' /etc/whaviso/api.env /etc/whaviso/zap.env 2>/dev/null | head -1 || true)
    umask 077
    { cat "$ATND_SEED"; [ -n "$MK" ] && printf '%s\n' "$MK"; } > "$ATND_ENV"
    chown root:root "$ATND_ENV"
    chmod 600 "$ATND_ENV"
    shred -u "$ATND_SEED" 2>/dev/null || rm -f "$ATND_SEED"
    [ -n "$MK" ] || echo "AVISO: MASTER_KEY nao achada em api.env/zap.env; atendente sobe mas nao decifra chave de LLM" >&2
  fi
  systemctl daemon-reload
  if [ -f "$ATND_ENV" ]; then
    systemctl enable whaviso-atendente >/dev/null 2>&1 || true
    systemctl restart whaviso-atendente
  else
    echo "AVISO: $ATND_ENV ausente (sem seed em $ATND_SEED); whaviso-atendente NAO iniciado" >&2
  fi
fi

echo ">> reiniciando os servicos"
systemctl restart whaviso-api
systemctl restart whaviso-zap   # reconecta a Meta Cloud API pelas credenciais (META_*)

echo ">> status"
systemctl --no-pager --lines=5 status whaviso-api whaviso-zap whaviso-atendente || true
echo ">> deploy concluido"
