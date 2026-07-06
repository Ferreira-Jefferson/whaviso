# Runbook: ações manuais de segurança (só o dono aplica)

Companheiro de [AUDITORIA-SEGURANCA.md](AUDITORIA-SEGURANCA.md) e [RISCOS-ACEITOS-E-DIFERIDOS.md](RISCOS-ACEITOS-E-DIFERIDOS.md). Lista o que precisa ser feito FORA do código (servidor, chaves, painel Supabase, deploy). Cada passo diz se depende do deploy. Data: 2026-07-06.

Sugestão de cadência: um passo por vez, confirmando cada um antes do próximo.

---

## 0. O que JÁ foi feito (não precisa refazer)

- [x] **Migrations 0069 e 0070 aplicadas no Supabase cloud** (`supabase db push`, pooler session 5432) e verificadas em produção: o role `whaviso_zap` tem exatamente os privilégios de coluna corretos em `envios`/`creditos_carteira` (e NÃO tem nas colunas da api); `anon`/`authenticated` não têm mais SELECT nas tabelas via PostgREST.
- [x] **Banco de teste local (`whaviso_dev`) recriado** com todas as migrations (validate_migrations) e check de cobertura de RLS passando.
- [x] **Correções de código aplicadas na branch `development`** (frontend, api, zap, nginx, systemd, CI), lint e typecheck passando. NÃO commitado nem deployado ainda (decisão sua).

---

## 1. Deploy do código (para as correções de código valerem em produção)  [pré-requisito de quase tudo abaixo]

As correções de código (helmet, trustProxy, bind 127.0.0.1, rate limit do zap, CSP do nginx, healthz sem número, etc.) só passam a valer em produção depois do deploy.

- [ ] Revisar o diff na `development` e commitar (as convenções do repo: sem travessão, sem menção a IA; commit no seu nome).
- [ ] Deploy para produção (branch `main`, via a GitHub Action / o fluxo `/deploy`).
- [ ] **Importante:** o deploy TEM que rodar `npm ci`/`npm install` no servidor, porque foram adicionadas 2 dependências de runtime: `@fastify/helmet` (api) e `@fastify/rate-limit` (zap). Sem isso, os serviços não sobem.

> As migrations já estão no cloud (passo 0), então aqui é só código. Se fizer pelo `/deploy`, ele detecta que não há migration pendente e segue direto para o deploy do código.

---

## 2. Servidor (VPS): dividir o EnvironmentFile por serviço  [depende do deploy trazer os *.example]

Reduz o raio de impacto (M1): hoje um arquivo único dá a cada processo os segredos do outro.

- [ ] Copiar os dois novos exemplos para os arquivos reais e preencher os valores:
```bash
cp /opt/whaviso/app/deploy/whaviso-api.env.example /etc/whaviso/api.env
cp /opt/whaviso/app/deploy/whaviso-zap.env.example /etc/whaviso/zap.env
nano /etc/whaviso/api.env    # API_DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.
nano /etc/whaviso/zap.env    # ZAP_DATABASE_URL, META_*, SUPABASE_SERVICE_ROLE_KEY, SEND_CODE_HOOK_SECRET
chown root:whaviso /etc/whaviso/api.env /etc/whaviso/zap.env
chmod 640 /etc/whaviso/api.env /etc/whaviso/zap.env
systemctl daemon-reload && systemctl restart whaviso-api whaviso-zap
```
- [ ] Depois de confirmar que os dois serviços subiram, remover o env único antigo:
```bash
rm -f /etc/whaviso/whaviso.env
```
> Os `.service` já apontam para os arquivos novos (`api.env`/`zap.env`) via o deploy do systemd.

---

## 3. Rotacionar segredos (raio de impacto do H1/M1)  [independe de deploy; só reiniciar serviços]

Faça idealmente junto com o passo 2 (já vai editar os env).

- [ ] **`SUPABASE_SERVICE_ROLE_KEY`** (a mais importante: bypassa RLS + Admin API): no painel Supabase (Settings > API), regenerar; atualizar em **api.env E zap.env** (as duas cópias); reiniciar os dois serviços.
- [ ] **`META_APP_SECRET` e `META_ACCESS_TOKEN`**: no App / System User da Meta, gerar novo; atualizar `zap.env`; reiniciar o zap.
- [ ] **`SEND_CODE_HOOK_SECRET`**: gerar novo `v1,whsec_...`; colar no painel Supabase (Authentication > Hooks > Send SMS) E no `zap.env` (os dois lados têm que bater); reiniciar o zap.

> Enquanto o H1 (tirar a service_role do zap) não for feito, a service_role vive nos dois env e deve ser rotacionada nos dois juntos.

---

## 4. Firewall e bind das portas  [depende do deploy para o bind]

- [ ] Após o deploy, confirmar que api e zap escutam só em loopback:
```bash
ss -tlnp | grep -E '3001|3002'   # deve mostrar 127.0.0.1, nao 0.0.0.0
```
- [ ] Confirmar o ufw:
```bash
ufw status verbose   # so 22 + 80/443 das faixas Cloudflare; 3001/3002 fechadas de fora
```

---

## 5. Validar a CSP e o login Google no site publicado  [depende do passo abaixo, NÃO é automático]

A CSP foi endurecida para o Google Identity Services sem afrouxar. **Importante: o `deploy.sh`/GitHub Action NUNCA toca no nginx** (só faz `git pull` + `npm ci` + build da SPA + restart de api/zap). Uma mudança em `deploy/nginx/whaviso.conf` só chega ao servidor com uma cópia manual.

- [ ] Copiar o `whaviso.conf` atualizado para o servidor e recarregar:
```bash
cp /opt/whaviso/app/deploy/nginx/whaviso.conf /etc/nginx/sites-available/whaviso.conf
nginx -t && systemctl reload nginx
```
- [ ] `curl -I https://whaviso.com` e conferir que o header `Content-Security-Policy` é o novo (com `https://accounts.google.com` em script-src/frame-src/connect-src e `object-src 'none'`).
  > Achado em 2026-07-06: essa validação vai falhar até o bug de herança do `add_header` ser corrigido (as locations `= /index.html` e `/assets/` tinham `add_header` próprio, que cancela a herança dos headers do `server{}`). Já corrigido no código (headers repetidos nas duas locations, com comentário explicando o porquê); precisa estar na cópia que for para o servidor.
- [ ] No navegador (DevTools > Console), fazer login com Google e confirmar ZERO violação de CSP e que o login funciona.
- [ ] Se o GIS puxar algo de `www.gstatic.com` (alguns fluxos puxam), acrescentar `https://www.gstatic.com` ao `script-src`/`connect-src` e redeployar.

---

## 6. Painel do Supabase (configuração, não código)  [independe de deploy]

Itens do checklist de produção do Supabase que dependem do painel:

- [ ] **Authentication > Rate Limits**: revisar os limites de ENVIO e de VERIFICAÇÃO de OTP/SMS. É a proteção real de brute-force do login (o OTP é validado pelo Supabase, não pela api).
- [ ] **Tokens/Sessão**: manter o TTL do access token (JWT) curto (ex.: 3600s); manter **Refresh Token Rotation** ligada e, se disponível, **Reuse Detection** (invalida a família ao detectar reuso de refresh token roubado).
- [ ] **OTP expiry** <= 3600s.
- [ ] **Database > Settings > SSL**: habilitar SSL Enforcement.
- [ ] **Network Restrictions**: limitar os IPs que acessam o banco, se viável com o pooler usado.
- [ ] **MFA na conta Supabase** e ao menos 2 owners na organização (evita perda de acesso).
- [ ] **PITR** conforme o tamanho do banco (PITR/snapshots do Supabase seguem **indisponiveis no plano FREE**; so em planos pagos). Enquanto isso, o backup proprio abaixo (item 10) cobre o gap.
- [ ] (Opcional) **CAPTCHA** nos fluxos de auth.

---

## 7. Meta / WhatsApp (quando ativar o webhook em produção)  [depende do deploy do nginx + ativação da Meta]

Hoje o inbound da Meta não está exposto (a `location /webhook/` do nginx está comentada de propósito; falta verificação da empresa + templates aprovados, ver o estado do projeto).

- [ ] Ao ativar: descomentar a `location /webhook/` em `deploy/nginx/whaviso.conf` (aponta para `127.0.0.1:3002`, já com `limit_req` e `client_max_body_size 128k`), depois `nginx -t && systemctl reload nginx`. Cadastrar o webhook na Meta apontando para `https://api.whaviso.com/webhook/whatsapp`.
- [ ] Restringir o System User da Meta ao mínimo (só a WABA e o phone number id em uso; escopos de envio + gestão de templates).
- [ ] **`META_ACCESS_TOKEN`**: guardar num cofre de segredos (não `.env` em texto puro fora de backups); definir rotina de rotação.
- [ ] Criar alerta operacional para o erro Graph `190` (token inválido/expirado): quando aparecer, o zap para de enviar/receber e precisa de aviso ativo, não só log.

---

## 8. Manutenção de dependências (dev tooling)  [independe de deploy]

O `npm audit` completo acusa 4 advisories, todas em dependências de DESENVOLVIMENTO (não vão para produção): `handlebars` (via `eslint-plugin-boundaries`) e `esbuild` (via `vitest`/`vite`). Não são exploráveis no runtime do app.

- [ ] Quando conveniente, atualizar `eslint-plugin-boundaries` (para trazer `handlebars` corrigido) e `vitest`/`vite`, depois rodar `npm audit` de novo e validar `npm run lint` e `npm test`. Fora do caminho crítico.

---

## 9. Follow-ups de engenharia (viram PR, não são "manuais")

Registrados em [RISCOS-ACEITOS-E-DIFERIDOS.md](RISCOS-ACEITOS-E-DIFERIDOS.md), por prioridade:
- [ ] **H1**: tirar a `service_role` do zap (endpoint interno na api para criar conta no aceite).
- [ ] **Inbox de inbound do WhatsApp** (ACHADOS 1/2/3 do zap): tabela `inbound_whatsapp` com `unique(wamid)`, gravar antes do 200, dedupe + idempotência.
- [ ] **API M2**: decisão de produto sobre o merge de conta por telefone não verificado.
- [ ] **API L2**: fixar `algorithms` do JWT após confirmar o alg do JWKS do projeto.
- [ ] (Qualidade) tornar os testes de integração do zap determinísticos quanto a timezone.

---

## 10. Backup próprio do banco (o gap de backup do plano FREE)  [depende do deploy trazer os arquivos]

O plano FREE do Supabase **não tem backup nenhum** (sem PITR, sem snapshot). O gap agora tem solução **no código**: uma rotina de `pg_dump` diária rodando no VPS por systemd timer (dumps em `/var/lib/whaviso/backups`, formato custom, rotação de 14 dias). Detalhes e o passo a passo completo em [../../deploy/README.md](../../deploy/README.md), seção "Backups do banco".

Passos manuais (resumo; o script `deploy/scripts/backup-db.sh` já vem no checkout após o deploy):
- [ ] Descobrir a versão do Postgres do servidor (`select version();`) e, se for mais nova que o `postgresql-client` do VPS (o Ubuntu 24.04 traz o 16), instalar o client compatível pelo PGDG e apontar `PG_DUMP_BIN` para o binário versionado. Sem isso o dump falha com "server version mismatch".
- [ ] Criar `/etc/whaviso/backup.env` a partir de `deploy/whaviso-backup.env.example`, com a `BACKUP_DATABASE_URL` do **owner `postgres`** (Session pooler 5432, **nunca** a 6543). Dono **root:root, modo 600** (mais restrito que api/zap.env: é a credencial do owner, acesso total).
- [ ] Copiar as 2 units (`whaviso-backup.service` e `.timer`) para `/etc/systemd/system/`, `systemctl daemon-reload`, testar com `systemctl start whaviso-backup.service` (conferir `journalctl` + `ls -la /var/lib/whaviso/backups`) e habilitar com `systemctl enable --now whaviso-backup.timer`.
- [ ] Guardar o procedimento de **restauração** (`deploy/scripts/restore-db.sh`) à mão: um backup que não se sabe restaurar é inútil.

> O dump é **sensível** (telefones, Pix, hashes de token): diretório 700, arquivos 600. Se enviar para fora da máquina (`BACKUP_REMOTE_CMD`), o destino tem que ser privado e criptografado. **PITR segue indisponível no FREE**: esta rotina é a rede de proteção enquanto não houver plano pago.
