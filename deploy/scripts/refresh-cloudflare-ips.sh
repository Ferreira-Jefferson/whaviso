#!/usr/bin/env bash
# whaviso: regenera a lista de IPs da Cloudflare usada pelo nginx (real IP) e pelo
# firewall. Rode como root quando a Cloudflare anunciar mudanca de faixas (raro).
#   sudo /opt/whaviso/deploy/scripts/refresh-cloudflare-ips.sh
set -euo pipefail

OUT=/etc/nginx/conf.d/whaviso-realip.conf
tmp="$(mktemp)"

echo "# gerado por refresh-cloudflare-ips.sh; nao editar a mao" > "$tmp"
{
  for url in https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6; do
    curl -fsS "$url" | while read -r cidr; do
      [ -n "$cidr" ] && echo "set_real_ip_from $cidr;"
    done
  done
  echo "real_ip_header CF-Connecting-IP;"
  echo "real_ip_recursive on;"
} >> "$tmp"

mv "$tmp" "$OUT"
nginx -t && systemctl reload nginx
echo ">> $OUT atualizado e nginx recarregado"

# Atualiza tambem o firewall: so a Cloudflare fala 80/443 com a origem.
echo ">> reaplicando regras de firewall da Cloudflare (ufw)"
for cidr in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
  ufw allow proto tcp from "$cidr" to any port 80,443 comment 'cloudflare' >/dev/null
done
echo ">> pronto. Lembre de remover faixas antigas com 'ufw status numbered' se mudaram."
