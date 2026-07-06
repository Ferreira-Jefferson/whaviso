# Deploy do whaviso (VPS Hostinger KVM 1 + Cloudflare)

Runbook para preparar o VPS do zero e deixar o sistema pronto para receber o projeto, com as medidas de seguranca aplicadas. Rode os comandos na ordem. Tudo em PowerShell e a partir do seu Windows quando indicado; o resto e no servidor (Ubuntu 24.04 LTS).

## Decisoes desta instalacao

- **Maquina:** Hostinger KVM 1 (1 vCPU, 4 GB RAM, NVMe), Ubuntu 24.04 LTS, datacenter Sao Paulo.
- **Dominio canonico:** `whaviso.com`. `whaviso.com.br` e os `www.*` fazem **301** para ele.
- **Borda:** **Cloudflare na frente dos dois dominios** (proxied / nuvem laranja). SSL **Full (strict)**, certificado de **origem** da Cloudflare no nginx. O IP do VPS fica escondido.
- **O que roda no VPS:** nginx (SPA estatica + proxy da api) e dois servicos Node via systemd (`api` :3001, `zap` :3002). Banco e Auth ficam no Supabase cloud.
- **O zap e um daemon de instancia unica.** Ele fala com a Meta Cloud API por HTTP (sem socket, sem QR): a conexao e por credenciais (`META_*` no env). Segue como instancia unica (scheduler + inbound por webhook); nao rode duas copias.

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
- [whaviso-api.env.example](whaviso-api.env.example) (vira `/etc/whaviso/api.env`) , [whaviso-zap.env.example](whaviso-zap.env.example) (vira `/etc/whaviso/zap.env`)
- [scripts/deploy.sh](scripts/deploy.sh) , [scripts/refresh-cloudflare-ips.sh](scripts/refresh-cloudflare-ips.sh)
- [scripts/backup-db.sh](scripts/backup-db.sh) , [scripts/restore-db.sh](scripts/restore-db.sh) , [systemd/whaviso-backup.service](systemd/whaviso-backup.service) , [systemd/whaviso-backup.timer](systemd/whaviso-backup.timer) , [whaviso-backup.env.example](whaviso-backup.env.example) (vira `/etc/whaviso/backup.env`) , ver [Backups do banco](#backups-do-banco-plano-free-nao-tem-backup)

---

## Fase 0: o que ter em maos

- IP do VPS (painel da Hostinger) e a senha/credencial de root do primeiro acesso.
- Sua chave SSH publica (no Windows): `Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub`. Se nao tiver, crie: `ssh-keygen -t ed25519`.
- O arquivo `secrets/production.env` do repo (esta no seu Windows; e **gitignored**, entao **nao** vem no clone). Dele saem os segredos dos `/etc/whaviso/api.env` e `/etc/whaviso/zap.env`.
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

# diretorios (/var/lib/whaviso = area de escrita de runtime do zap)
mkdir -p /opt/whaviso /var/lib/whaviso /etc/whaviso /var/www
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

### 6a. Env de producao do servidor (dois arquivos, um por servico)

Cada servico le SO os seus segredos: a api em `/etc/whaviso/api.env`, o zap em `/etc/whaviso/zap.env`. Separar evita que um processo carregue no ambiente os segredos do outro (comprometer a api nao expoe a conn string do `whaviso_zap` nem os `META_*`, e vice-versa).

```bash
cp /opt/whaviso/app/deploy/whaviso-api.env.example /etc/whaviso/api.env
cp /opt/whaviso/app/deploy/whaviso-zap.env.example /etc/whaviso/zap.env
nano /etc/whaviso/api.env    # API_DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY
nano /etc/whaviso/zap.env    # ZAP_DATABASE_URL, META_*, SUPABASE_SERVICE_ROLE_KEY, (SEND_CODE_HOOK_SECRET)
```

Preencha os segredos **copiando do seu `secrets/production.env` local** (no Windows; ele e gitignored e nao veio no clone): `API_DATABASE_URL` (api), `ZAP_DATABASE_URL` (zap), `SUPABASE_SERVICE_ROLE_KEY` (**nos dois** por enquanto: a chave e usada pela api e pelo zap; ver nota no `whaviso-zap.env.example`) e os `META_*` (zap). Sobre as strings de banco, veja o **Apendice A** antes de colar. Depois trave as permissoes dos dois:

```bash
chown root:whaviso /etc/whaviso/api.env /etc/whaviso/zap.env
chmod 640 /etc/whaviso/api.env /etc/whaviso/zap.env
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
journalctl -u whaviso-zap -n 30 --no-pager       # zap subindo
```

---

## Fase 10: conexao com o WhatsApp (Meta Cloud API)

Nao ha pareamento nem QR: o zap fala com a Meta Cloud API por HTTP e a conexao e por **credenciais** (`META_*` no `/etc/whaviso/zap.env`). Basta as vars estarem preenchidas (token, phone number id, app secret, verify token) que o zap sobe conectado; sem as essenciais ele encerra com mensagem clara no log. O runbook de operacao da Meta (verificacao da empresa, registro do numero, System User, webhook e templates) esta em [META_CLOUD_API.md](META_CLOUD_API.md).

---

## Fase 11: checklist de seguranca e verificacao

```bash
ufw status verbose                       # so 22 (OpenSSH) e 80/443 das faixas da Cloudflare
sshd -T | grep -E 'permitrootlogin|passwordauthentication'   # no / no
fail2ban-client status sshd              # jail ativa
systemctl is-enabled unattended-upgrades # enabled
ss -tlnp | grep -E '3001|3002'           # bindam em 127.0.0.1 (nao 0.0.0.0); so o nginx alcanca
stat -c '%a %U:%G' /etc/whaviso/api.env              # 640 root:whaviso
stat -c '%a %U:%G' /etc/whaviso/zap.env              # 640 root:whaviso
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

## Backups do banco (plano FREE nao tem backup)

O plano FREE do Supabase NAO tem backup nenhum (sem PITR, sem snapshot automatico). Sem uma rotina propria, o banco de producao fica sem rede de protecao. Este kit inclui um backup diario proprio, de graca, rodando **no VPS** via `pg_dump` agendado por systemd timer. Os dumps ficam em `/var/lib/whaviso/backups` (fora do checkout, persiste entre deploys e reboots), em formato custom (`-Fc`), com rotacao (14 dias por padrao).

O dump e **sensivel**: contem telefones, Pix e hashes de token. O script cria o diretorio 700 e os arquivos 600. Se mandar para fora da maquina (offsite via `BACKUP_REMOTE_CMD`), o destino tem que ser privado e idealmente criptografado.

### Escopo do dump

Dump **completo** do banco pelo owner `postgres` (o mais completo e restauravel). O dado critico e nao reconstruivel do whaviso vive em `public` (tabelas de negocio) e `auth` (usuarios do Supabase Auth), os unicos schemas que o whaviso usa (Supabase = Postgres + Auth, sem Storage/Realtime/Edge). Se algum dia o dump completo reclamar de um schema gerenciado do Supabase que o owner nao le por inteiro (raro; ex.: `vault`/`pgsodium`), limite o escopo com `BACKUP_PG_DUMP_ARGS="-n public -n auth"` no `backup.env`: isso ainda captura 100% do que e do whaviso. O owner e obrigatorio: os roles de app (`whaviso_api`/`whaviso_zap`) sao de privilegio minimo e nao leem tudo.

### Ponto critico: versao do pg_dump

O `pg_dump` **recusa** rodar se for mais VELHO que o servidor ("server version mismatch"). O Ubuntu 24.04 traz o `postgresql-client` 16; se o Supabase for Postgres 17+, o client 16 nao serve.

1. Descubra a versao do servidor (do seu Windows ou do VPS, com a conn do owner):
   ```bash
   psql "postgresql://postgres.<ref>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres" -Atc "select version();"
   ```
2. Instale o client compativel (>= a versao do servidor) pelo repositorio oficial PGDG:
   ```bash
   sudo apt install -y curl ca-certificates
   sudo install -d /usr/share/postgresql-common/pgdg
   sudo curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
   . /etc/os-release
   echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
   sudo apt update
   sudo apt install -y postgresql-client-17     # troque 17 pela versao do servidor
   ```
   O binario fica em `/usr/lib/postgresql/17/bin/pg_dump`. Aponte `PG_DUMP_BIN` para ele no `backup.env`.

### Conexao (pooler)

Use o **Session pooler (IPv4, :5432)** ou a conexao **direta (IPv6)**, com a conn do owner `postgres`. **Nunca** o transaction pooler (:6543): ele nao suporta `pg_dump` direito. Ver o [Apendice A](#apendice-a-string-de-conexao-do-banco-ipv6-x-pooler-ipv4) sobre IPv6 x pooler.

### Instalar

O script `deploy/scripts/backup-db.sh` **ja vem no checkout** (`/opt/whaviso/app/...`). Falta so criar a env e instalar as 2 units:

```bash
# 1. Env (root:root 600, porque a conn do owner e altamente sensivel)
cp /opt/whaviso/app/deploy/whaviso-backup.env.example /etc/whaviso/backup.env
nano /etc/whaviso/backup.env     # BACKUP_DATABASE_URL (owner postgres, SESSION pooler 5432) + PG_DUMP_BIN
chown root:root /etc/whaviso/backup.env
chmod 600 /etc/whaviso/backup.env

# 2. Units (o deploy.sh NAO instala systemd; e sempre copia manual)
chmod +x /opt/whaviso/app/deploy/scripts/backup-db.sh /opt/whaviso/app/deploy/scripts/restore-db.sh
cp /opt/whaviso/app/deploy/systemd/whaviso-backup.service /etc/systemd/system/
cp /opt/whaviso/app/deploy/systemd/whaviso-backup.timer   /etc/systemd/system/
systemctl daemon-reload

# 3. Teste manual (roda o backup uma vez agora)
systemctl start whaviso-backup.service
journalctl -u whaviso-backup.service -n 40 --no-pager     # ver "backup OK"
ls -la /var/lib/whaviso/backups                           # o .dump com permissao 600

# 4. Habilita o timer diario
systemctl enable --now whaviso-backup.timer
systemctl list-timers whaviso-backup.timer --no-pager     # confere o proximo disparo
```

Se o teste (passo 3) falhar por "server version mismatch", volte ao "Ponto critico" acima, instale o client versionado e ajuste `PG_DUMP_BIN`.

### Restaurar

Um backup que voce nao sabe restaurar e inutil. O `deploy/scripts/restore-db.sh` faz o `pg_restore` correspondente ao formato custom. Por padrao ele so **previa** (mostra o indice do dump e o comando que rodaria) e NAO toca no banco; passe `--yes` para restaurar de verdade.

```bash
# previa (nao toca em nada): mostra o conteudo do dump
/opt/whaviso/app/deploy/scripts/restore-db.sh /var/lib/whaviso/backups/whaviso-YYYYMMDD-HHMMSS.dump

# restauracao real (DESTRUTIVA: --clean --if-exists derruba objetos existentes no destino)
RESTORE_DATABASE_URL="postgresql://postgres.<ref>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres" \
  /opt/whaviso/app/deploy/scripts/restore-db.sh --yes /var/lib/whaviso/backups/whaviso-YYYYMMDD-HHMMSS.dump
```

Avisos:
- Restaurar por cima do banco de **producao** e destrutivo. Se o objetivo e recuperar dados, restaure primeiro num projeto/banco **novo e limpo**, confira, e so entao promova.
- Use o OWNER `postgres` no destino (`RESTORE_DATABASE_URL`), SESSION pooler (:5432) ou direta, NUNCA a 6543.
- Para restaurar so parte, use `RESTORE_PG_RESTORE_ARGS` (ex.: `-n public` so o schema de negocio, ou `--data-only`). Veja o indice com a previa antes.

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
2. Defina `SEND_CODE_HOOK_SECRET` (formato `v1,whsec_...`) em `/etc/whaviso/zap.env` e reinicie o zap: `systemctl restart whaviso-zap`.
3. No painel do Supabase (Authentication > Hooks > Send SMS hook): tipo **HTTPS**, URL `https://api.whaviso.com/hooks/send-code`, e cole o **mesmo** segredo. Habilite tambem o provider **Phone**. Sem o secret batendo nos dois lados, o zap responde 503/401 e nada e entregue.

## Apendice C: limpeza pendente (referencias a Vercel)

A decisao e VPS (sem Vercel), mas alguns arquivos ainda mencionam Vercel e devem ser ajustados quando der: o comentario `→ Vercel` em `backend/.env.example` e `secrets/production.env(.example)`, e o alvo `vercel` em `backend/scripts/push_secrets.sh`. Nao bloqueiam o deploy; sao so heranca da arquitetura anterior.
