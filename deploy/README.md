# Deploy do whaviso (VPS Hostinger KVM 1 + Cloudflare)

Runbook para preparar o VPS do zero e deixar o sistema pronto para receber o projeto, com as medidas de seguranca aplicadas. Rode os comandos na ordem. Tudo em PowerShell e a partir do seu Windows quando indicado; o resto e no servidor (Ubuntu 24.04 LTS).

## Decisoes desta instalacao

- **Maquina:** Hostinger KVM 1 (1 vCPU, 4 GB RAM, NVMe), Ubuntu 24.04 LTS, datacenter Sao Paulo.
- **Dominio canonico:** `whaviso.com`. `whaviso.com.br` e os `www.*` fazem **301** para ele.
- **Borda:** **Cloudflare na frente dos dois dominios** (proxied / nuvem laranja). SSL **Full (strict)**, certificado de **origem** da Cloudflare no nginx. O IP do VPS fica escondido.
- **O que roda no VPS:** nginx (SPA estatica + proxy da api) e dois servicos Node via systemd (`api` :3001, `zap` :3002). Banco e Auth ficam no Supabase cloud.
- **O zap e um daemon de instancia unica** (segura o socket do WhatsApp/Baileys e um lock). Nunca rode duas copias. Sessao do Baileys persiste em `/var/lib/whaviso`.

## Topologia

```
                 whaviso.com  /  whaviso.com.br (301)
                        |
              Cloudflare (TLS de borda, WAF, esconde o IP)
                        |  Full (strict)
                  nginx :443  (cert de origem CF)
                  /                         \
        SPA estatica                   api.whaviso.com
     /var/www/whaviso              -> 127.0.0.1:3001 (api)
                                    -> /hooks/ -> 127.0.0.1:3002 (zap, Send SMS Hook)

  zap :3002  -> so /hooks/ exposto (sob api.whaviso.com); resto so no firewall interno
  api/zap    -> Supabase cloud (Postgres + Auth)
```

## Arquivos deste kit

- [nginx/whaviso-http.conf](nginx/whaviso-http.conf) , [nginx/whaviso.conf](nginx/whaviso.conf)
- [systemd/whaviso-api.service](systemd/whaviso-api.service) , [systemd/whaviso-zap.service](systemd/whaviso-zap.service)
- [whaviso.env.example](whaviso.env.example) (vira `/etc/whaviso/whaviso.env`)
- [scripts/deploy.sh](scripts/deploy.sh) , [scripts/refresh-cloudflare-ips.sh](scripts/refresh-cloudflare-ips.sh)

---

## Fase 0: o que ter em maos

- IP do VPS (painel da Hostinger) e a senha/credencial de root do primeiro acesso.
- Sua chave SSH publica (no Windows): `Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub`. Se nao tiver, crie: `ssh-keygen -t ed25519`.
- O arquivo `secrets/production.env` do repo (esta no seu Windows; e **gitignored**, entao **nao** vem no clone). Dele saem os segredos do `/etc/whaviso/whaviso.env`.
- Acesso ao painel da Cloudflare (dominio `.com` ja esta la) e ao painel da registro.br (`.com.br`).

---

## Fase 1: primeiro acesso e usuarios

Acesse como root e crie um usuario administrador (com sudo) e um usuario de servico sem login (dono do app):

```bash
ssh root@SEU_IP

# administrador (login interativo, com sudo)
adduser deploy
usermod -aG sudo deploy

# instala sua chave publica no usuario deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys          # cole sua chave publica .pub
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

# usuario de SERVICO (sem shell), dono do app e dos servicos
adduser --system --group --home /opt/whaviso --shell /usr/sbin/nologin whaviso

# diretorios
mkdir -p /opt/whaviso /var/lib/whaviso/auth_baileys /etc/whaviso /var/www
chown -R whaviso:whaviso /opt/whaviso /var/lib/whaviso
chmod 750 /var/lib/whaviso
```

**Antes de seguir**, abra um **segundo terminal** e confirme que o login por chave funciona: `ssh deploy@SEU_IP`. So depois desligue o login por senha (proxima fase), senao voce pode se trancar para fora.

---

## Fase 2: hardening do sistema operacional

```bash
# atualizar tudo
apt update && apt -y full-upgrade && apt -y autoremove

# fuso horario UTC (o app converte para America/Sao_Paulo internamente; banco em UTC)
timedatectl set-timezone UTC

# swap de 2 GB (rede de seguranca para a build da SPA em 4 GB de RAM)
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-whaviso.conf && sysctl --system

# atualizacoes de seguranca automaticas
apt install -y unattended-upgrades
printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades

# fail2ban (banir forca bruta de SSH)
apt install -y fail2ban
printf '[sshd]\nenabled = true\nmaxretry = 5\nbantime = 1h\nfindtime = 10m\n' > /etc/fail2ban/jail.d/sshd.local
systemctl enable --now fail2ban
```

**SSH key-only** (so faca depois de validar o login do `deploy` por chave):

```bash
cat > /etc/ssh/sshd_config.d/99-whaviso.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
KbdInteractiveAuthentication no
X11Forwarding no
AllowUsers deploy
EOF
systemctl restart ssh
```

---

## Fase 3: firewall (ufw)

Bloqueia tudo de entrada, libera SSH, e abre 80/443 **so para os IPs da Cloudflare** (ninguem alcanca a origem direto pelo IP). As portas 3001/3002 ficam fechadas para fora por padrao (so o nginx as alcanca no localhost).

```bash
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH

# 80/443 apenas da Cloudflare
for cidr in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
  ufw allow proto tcp from "$cidr" to any port 80,443 comment 'cloudflare'
done

ufw enable
ufw status verbose
```

---

## Fase 4: Node 22 e nginx

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v        # deve ser v22.x

apt install -y nginx
```

---

## Fase 5: DNS e SSL na Cloudflare

Tudo pelos paineis (Cloudflare + registro.br). Use o IP do seu VPS.

### 5a. Zona `.com` (ja esta na Cloudflare)

Em **DNS > Records**, crie (todos com o **proxy ligado / nuvem laranja**):

| Tipo | Nome | Conteudo |
|---|---|---|
| A | `whaviso.com` | `SEU_IP` |
| A | `api` | `SEU_IP` |
| CNAME | `www` | `whaviso.com` |

Se o VPS tiver IPv6 roteavel, adicione os `AAAA` equivalentes.

### 5b. Zona `.com.br` (mover o DNS para a Cloudflare)

1. Na Cloudflare, **Add a site** -> `whaviso.com.br` (plano Free). Ela mostra **dois nameservers**.
2. Na **registro.br**, no dominio `whaviso.com.br`, troque os nameservers para os dois da Cloudflare. (Propaga em minutos a algumas horas.)
3. Na zona `.com.br` da Cloudflare, crie (proxied):

| Tipo | Nome | Conteudo |
|---|---|---|
| A | `whaviso.com.br` | `SEU_IP` |
| CNAME | `www` | `whaviso.com.br` |

### 5c. SSL/TLS (faca nas duas zonas)

- **SSL/TLS > Overview:** modo **Full (strict)**.
- **Edge Certificates:** Always Use HTTPS = **On**, Minimum TLS = **1.2**, Auto Minify/Brotli a gosto, **HSTS** ligado (so depois de confirmar que o HTTPS funciona).
- Em `api.whaviso.com` evite cache de respostas dinamicas: crie uma Cache Rule de **Bypass cache** para `api.whaviso.com/*` (ou confie no `Cache-Control` da api).

### 5d. Certificado de origem (instalar no nginx)

Em **SSL/TLS > Origin Server > Create Certificate**, gere um certificado listando os hostnames:
`whaviso.com`, `*.whaviso.com`, `whaviso.com.br`, `*.whaviso.com.br`.

Copie o **certificado** e a **chave** para o servidor:

```bash
mkdir -p /etc/ssl/cloudflare
nano /etc/ssl/cloudflare/whaviso-origin.pem   # cole o certificado
nano /etc/ssl/cloudflare/whaviso-origin.key   # cole a chave privada
chmod 644 /etc/ssl/cloudflare/whaviso-origin.pem
chmod 600 /etc/ssl/cloudflare/whaviso-origin.key
```

> Se a Cloudflare nao deixar listar os hostnames das duas zonas num cert so, gere um cert por zona e mova as diretivas `ssl_certificate`/`ssl_certificate_key` para dentro de cada `server {}` em `whaviso.conf` (um par para os blocos `.com`, outro para o bloco de redirect `.com.br`).

---

## Fase 6: trazer o codigo (deploy key read-only)

O repo e privado no GitHub. Gere uma chave de deploy **somente leitura** no servidor:

```bash
ssh-keygen -t ed25519 -C "whaviso-vps-deploy" -f /root/.ssh/id_ed25519 -N ""
cat /root/.ssh/id_ed25519.pub
```

Adicione essa chave em **github.com/Ferreira-Jefferson/whaviso > Settings > Deploy keys** (marque **Read only**, sem write). Depois:

```bash
ssh -o StrictHostKeyChecking=accept-new -T git@github.com   # aceita o host (ok ver "successfully authenticated")
git clone git@github.com:Ferreira-Jefferson/whaviso.git /opt/whaviso/app
```

### 6a. Env de producao do servidor (`/etc/whaviso/whaviso.env`)

```bash
cp /opt/whaviso/app/deploy/whaviso.env.example /etc/whaviso/whaviso.env
nano /etc/whaviso/whaviso.env
```

Preencha os segredos **copiando do seu `secrets/production.env` local** (no Windows; ele e gitignored e nao veio no clone): `API_DATABASE_URL`, `ZAP_DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Sobre as strings de banco, veja o **Apendice A** antes de colar. Depois:

```bash
chown root:whaviso /etc/whaviso/whaviso.env
chmod 640 /etc/whaviso/whaviso.env
```

### 6b. Env de build do frontend (valores publicos)

```bash
cat > /opt/whaviso/app/frontend/.env.production <<'EOF'
VITE_SUPABASE_URL=https://exxczsyjvgjsxmwlrwww.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=COLE_A_PUBLISHABLE_KEY
VITE_API_URL=https://api.whaviso.com
EOF
```

A publishable key e publica por design (sai no bundle), esta no seu `secrets/production.env`. Esse arquivo e gitignored, entao sobrevive aos `git reset --hard` dos deploys.

---

## Fase 7: servicos systemd

```bash
cp /opt/whaviso/app/deploy/systemd/whaviso-api.service /etc/systemd/system/
cp /opt/whaviso/app/deploy/systemd/whaviso-zap.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable whaviso-api whaviso-zap        # liga no boot (start vem no deploy)
```

---

## Fase 8: nginx

```bash
cp /opt/whaviso/app/deploy/nginx/whaviso-http.conf /etc/nginx/conf.d/
cp /opt/whaviso/app/deploy/nginx/whaviso.conf /etc/nginx/sites-available/
ln -sf /etc/nginx/sites-available/whaviso.conf /etc/nginx/sites-enabled/whaviso.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t                       # tem de passar (o cert de origem precisa ja estar na Fase 5d)
```

Ainda nao recarregue: a primeira build (Fase 9) cria o `/var/www/whaviso`.

---

## Fase 9: primeira build e subida

```bash
chmod +x /opt/whaviso/app/deploy/scripts/*.sh
/opt/whaviso/app/deploy/scripts/deploy.sh        # npm ci, build da SPA, publica e starta api+zap
systemctl reload nginx
```

Verifique:

```bash
systemctl status whaviso-api whaviso-zap --no-pager
curl -fsS 127.0.0.1:3001/healthz                 # api respondendo localmente
journalctl -u whaviso-zap -n 30 --no-pager       # zap subindo + linha do QR
```

---

## Fase 10: parear o WhatsApp (Baileys, 1o boot)

A sessao do WhatsApp ainda nao existe. O jeito mais simples de parear sem precisar da tela de admin e por **pairing code**:

```bash
# em /etc/whaviso/whaviso.env, defina temporariamente:
#   WHATS_PHONE=55SEUNUMERO        (so digitos, com DDI)
#   WHATS_USE_PAIRING=true
systemctl restart whaviso-zap
journalctl -u whaviso-zap -f      # aparece "codigo de pareamento do WhatsApp"
# no celular: WhatsApp > Aparelhos conectados > Conectar aparelho > Conectar com numero > digite o codigo
```

Alternativa por **QR**: o zap grava `qr.png` em `/var/lib/whaviso/qr.png` e tambem na tabela `whats_sessao` (a tela de admin da SPA mostra o QR, botao Conectar). Para pegar a imagem:

```bash
# no seu Windows:
scp deploy@SEU_IP:/var/lib/whaviso/qr.png .     # se faltar permissao, copie via sudo no servidor antes
```

Quando conectar, os logs mostram `WhatsApp conectado`. A sessao fica em disco e **nao** precisa reescanear a cada restart.

---

## Fase 11: checklist de seguranca e verificacao

```bash
ufw status verbose                       # so 22 (OpenSSH) e 80/443 das faixas da Cloudflare
sshd -T | grep -E 'permitrootlogin|passwordauthentication'   # no / no
fail2ban-client status sshd              # jail ativa
systemctl is-enabled unattended-upgrades # enabled
ss -tlnp | grep -E '3001|3002'           # escutam local; o firewall bloqueia de fora
stat -c '%a %U:%G' /etc/whaviso/whaviso.env          # 640 root:whaviso
stat -c '%a' /etc/ssl/cloudflare/whaviso-origin.key  # 600
```

Do seu Windows (passando pela Cloudflare):

```bash
curl -I https://whaviso.com               # 200, e cabecalhos HSTS/X-Content-Type-Options
curl -I https://whaviso.com.br            # 301 para https://whaviso.com
curl -fsS https://api.whaviso.com/healthz # api saudavel pela borda
# tentar o IP direto deve falhar (origem escondida): nc -vz SEU_IP 3001
```

Confira tambem no painel: Cloudflare em **Full (strict)**, Always HTTPS e HSTS ligados; a `whaviso.com.br` ja resolvendo pelos nameservers da Cloudflare.

---

## Deploy continuo e rollback

Atualizar para o ultimo `main`:

```bash
sudo /opt/whaviso/app/deploy/scripts/deploy.sh
```

Rollback rapido da SPA (o deploy guarda a versao anterior):

```bash
sudo rm -rf /var/www/whaviso && sudo mv /var/www/whaviso.old /var/www/whaviso
```

Rollback do backend: `git checkout <sha-anterior>` em `/opt/whaviso/app` e rode o deploy de novo.

---

## Apendice A: string de conexao do banco (IPv6 x pooler IPv4)

A conexao **direta** do Supabase (`db.<ref>.supabase.co:5432`) resolve **so por IPv6**. Teste no VPS:

```bash
getent ahosts db.exxczsyjvgjsxmwlrwww.supabase.co
nc -6 -vz db.exxczsyjvgjsxmwlrwww.supabase.co 5432
```

- **Tem IPv6 e conectou:** use as strings diretas que ja estao no `secrets/production.env`.
- **Sem IPv6 (ou nao conectou):** use o **Session Pooler (IPv4, porta 5432)**. No painel do Supabase, **Connect > Session pooler**, copie o host/regiao (algo como `aws-0-<regiao>.pooler.supabase.com`) e monte:

  ```
  postgresql://whaviso_api.<ref>:<SENHA_whaviso_api>@aws-0-<regiao>.pooler.supabase.com:5432/postgres
  postgresql://whaviso_zap.<ref>:<SENHA_whaviso_zap>@aws-0-<regiao>.pooler.supabase.com:5432/postgres
  ```

  Mantenha o sufixo `.<ref>` no usuario e use as senhas dos roles `whaviso_api`/`whaviso_zap` do `production.env`. **Use a porta 5432 (session pooler), nunca a 6543 (transaction pooler):** o app usa transacoes com `FOR UPDATE SKIP LOCKED` e pools de vida longa, que o session pooler suporta como uma conexao direta.

## Apendice B: habilitar o OTP por telefone

O Send SMS Hook do Supabase (nuvem) entrega o codigo chamando `/hooks/send-code` do zap por HTTPS. O [nginx/whaviso.conf](nginx/whaviso.conf) **ja expoe esse path**: sob `api.whaviso.com`, um `location /hooks/` faz proxy para o zap (`127.0.0.1:3002`), enquanto `/` continua indo pro api (`:3001`). nginx casa o prefixo mais especifico, entao `/hooks/send-code` cai no zap e o resto na api. **Sem subdominio novo e sem DNS/cert novo** (o `api.whaviso.com` ja existe e o cert `*.whaviso.com` ja cobre).

Para ligar:

1. Garanta que o `nginx/whaviso.conf` atualizado esta no servidor e recarregue: `nginx -t && systemctl reload nginx`.
2. Defina `SEND_CODE_HOOK_SECRET` (formato `v1,whsec_...`) em `/etc/whaviso/whaviso.env` e reinicie o zap: `systemctl restart whaviso-zap`.
3. No painel do Supabase (Authentication > Hooks > Send SMS hook): tipo **HTTPS**, URL `https://api.whaviso.com/hooks/send-code`, e cole o **mesmo** segredo. Habilite tambem o provider **Phone**. Sem o secret batendo nos dois lados, o zap responde 503/401 e nada e entregue.

## Apendice C: limpeza pendente (referencias a Vercel)

A decisao e VPS (sem Vercel), mas alguns arquivos ainda mencionam Vercel e devem ser ajustados quando der: o comentario `→ Vercel` em `backend/.env.example` e `secrets/production.env(.example)`, e o alvo `vercel` em `backend/scripts/push_secrets.sh`. Nao bloqueiam o deploy; sao so heranca da arquitetura anterior.
