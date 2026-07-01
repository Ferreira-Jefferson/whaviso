#!/usr/bin/env bash
# whaviso: mantem o secret DEPLOY_HOST (+ SSH_KNOWN_HOSTS) do GitHub em dia com o IPv4
# atual do VPS. O IP de origem muda de tempos em tempos (a Cloudflare esconde a origem e,
# por design, NADA de DNS aponta pro VPS, ver deploy/CICD.md); quando muda, o deploy do CI
# falha no SSH ("connect to host ... port 22: Connection timed out") porque o secret aponta
# pro IP velho. Este script roda no VPS por timer: detecta o IP publico e, se mudou,
# reescreve os dois secrets via `gh` (que faz a criptografia sealed-box exigida pela API).
# Assim o proximo deploy ja acha o VPS sozinho, sem ninguem mexer secret na mao.
#
# O IP continua vivendo SO no secret (nao vai pra DNS): o esconde-IP da Cloudflare fica
# intacto. As chaves de host do SSH NAO mudam quando o IP muda (mesma maquina), entao o
# SSH_KNOWN_HOSTS e so as mesmas chaves com o IP novo na frente.
#
# Requisitos no VPS:
#   - `gh` (GitHub CLI) instalado.
#   - GH_TOKEN no ambiente (via /etc/whaviso/deploy-host.env): fine-grained PAT com escopo
#     MINIMO -> so este repositorio, permissao "Secrets: Read and write". Nada mais.
#   - `curl`. Rode por systemd timer (deploy/systemd/whaviso-deploy-host.{service,timer}).
#
# Escape hatch de teste: FORCE=1 reescreve os secrets mesmo que o IP nao tenha mudado.
set -euo pipefail

REPO="Ferreira-Jefferson/whaviso"
STATE_DIR=/var/lib/whaviso
STATE_FILE="$STATE_DIR/deploy-host-ip"
# Servicos de eco de IP (tenta em ordem; cai no proximo se um falhar). Sempre IPv4.
IP_ECHOS=(https://api.ipify.org https://ipv4.icanhazip.com https://ifconfig.me/ip)

log() { echo "[update-deploy-host] $*"; }

detectar_ip() {
  local ip url
  for url in "${IP_ECHOS[@]}"; do
    ip=$(curl -4 -fsS -m 10 "$url" 2>/dev/null | tr -d '[:space:]') || continue
    if [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
      echo "$ip"
      return 0
    fi
  done
  return 1
}

command -v gh >/dev/null 2>&1 || { log "gh nao instalado; abortando"; exit 1; }
[ -n "${GH_TOKEN:-}" ] || { log "GH_TOKEN ausente (ver /etc/whaviso/deploy-host.env); abortando"; exit 1; }

IP=$(detectar_ip) || { log "nao consegui detectar o IPv4 publico; saindo sem mexer em nada"; exit 0; }

ANTERIOR=""
[ -f "$STATE_FILE" ] && ANTERIOR=$(cat "$STATE_FILE" 2>/dev/null || true)

if [ "$IP" = "$ANTERIOR" ] && [ "${FORCE:-0}" != "1" ]; then
  log "IP inalterado ($IP); nada a fazer"
  exit 0
fi

log "IP mudou (antes='${ANTERIOR:-vazio}', agora='$IP'); atualizando secrets do GitHub"

# SSH_KNOWN_HOSTS: uma linha por chave de host do proprio VPS, com o IP novo na frente.
# As chaves nao mudam com o IP (mesma maquina), so a coluna do host.
KH=$(
  for pub in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_rsa_key.pub /etc/ssh/ssh_host_ecdsa_key.pub; do
    [ -f "$pub" ] || continue
    printf '%s %s\n' "$IP" "$(cut -d' ' -f1-2 "$pub")"
  done
)
if [ -z "$KH" ]; then
  log "sem chaves de host em /etc/ssh; abortando SEM tocar nos secrets"
  exit 1
fi

# `gh` busca a public key do repo, faz o sealed-box e da o PUT. Passa o valor por stdin
# (nao aparece em `ps`). GH_TOKEN vem do EnvironmentFile do systemd.
printf '%s' "$IP" | gh secret set DEPLOY_HOST     -R "$REPO"
printf '%s' "$KH" | gh secret set SSH_KNOWN_HOSTS -R "$REPO"

install -m 700 -d "$STATE_DIR"
printf '%s' "$IP" > "$STATE_FILE"
log "OK: DEPLOY_HOST e SSH_KNOWN_HOSTS agora apontam para $IP"
