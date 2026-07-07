# Runbook: ações manuais de segurança (só o dono aplica)

Companheiro de [AUDITORIA-SEGURANCA.md](AUDITORIA-SEGURANCA.md) e [RISCOS-ACEITOS-E-DIFERIDOS.md](RISCOS-ACEITOS-E-DIFERIDOS.md). Lista o que precisa ser feito FORA do código (servidor, chaves, painel Supabase, deploy). Cada passo diz se depende do deploy. Data: 2026-07-06. **Atualizado em 2026-07-07** (ver o bloco de status no passo 0).

Sugestão de cadência: um passo por vez, confirmando cada um antes do próximo.

---

## 0. O que JÁ foi feito (não precisa refazer)

- [x] **Migrations 0069 e 0070 aplicadas no Supabase cloud** (`supabase db push`, pooler session 5432) e verificadas em produção: o role `whaviso_zap` tem exatamente os privilégios de coluna corretos em `envios`/`creditos_carteira` (e NÃO tem nas colunas da api); `anon`/`authenticated` não têm mais SELECT nas tabelas via PostgREST.
- [x] **Banco de teste local (`whaviso_dev`) recriado** com todas as migrations (validate_migrations) e check de cobertura de RLS passando.
- [x] **Hardening de segurança commitado e DEPLOYADO em produção (2026-07-07)** (frontend, api, zap, nginx, systemd, CI): gate + deploy da GitHub Action verdes.

### Concluído em 2026-07-07 (esta rodada)

- [x] **Passo 1 (deploy do hardening)** e **Passo 5 (nginx/CSP)**: no ar. CSP/HSTS/X-Frame-Options ativos no documento (confirmado por curl); login Google validado com **zero violação de CSP**.
- [x] **Passo 6 (painel Supabase)**: rate limits, Refresh Token Rotation + Reuse Detection, OTP expiry (Phone 600s/Email 3600s), anonymous OFF, SSL Enforcement, MFA (2 fatores). Detalhes no passo 6.
- [x] **Passo 10 (backup próprio do banco)**: instalado e no ar no VPS (pg_dump 17, timer diário). Detalhes no passo 10.
- [x] **Frontend (avisos de console) DEPLOYADO**: commit `6562627` (GIS init única + `@hookform/resolvers` 5.4.0 para zod v4) foi para produção junto com a fonte Lora e o rodapé, no deploy de 2026-07-07 (main = `094ed31`).
- [ ] **Pendente de deploy**: correção do bind da api (`0.0.0.0` -> `127.0.0.1`, ver passo 4) e estas atualizações do runbook. Uncommitted na `development`.

- [x] **Passo 2 (dividir env por serviço)**: `api.env`/`zap.env` separados no VPS, `whaviso.env` único removido; api e zap rodando com os próprios segredos.

**Ainda pendente por você (detalhado abaixo):** passo 3 (rotacionar segredos), passo 4 (conferir firewall/bind), passo 7 (Meta, quando ativar), passo 8 (deps de dev), passo 9 (follow-ups de engenharia).

---

## 1. Deploy do código (para as correções de código valerem em produção)  [pré-requisito de quase tudo abaixo]

As correções de código (helmet, trustProxy, bind 127.0.0.1, rate limit do zap, CSP do nginx, healthz sem número, etc.) só passam a valer em produção depois do deploy.

- [x] Revisado e commitado (commit `dea8652` + follow-ups `1dfd8b5`/`ae283d3`/`7581c78`), no seu nome, sem travessão/IA.
- [x] Deploy para produção (branch `main`, GitHub Action): gate + deploy verdes em 2026-07-07.
- [x] O deploy rodou `npm ci` no servidor (as 2 deps de runtime `@fastify/helmet` e `@fastify/rate-limit` subiram; api/zap no ar).

> Pendente relacionado: o commit `6562627` (frontend, avisos de console do login) está na `development` e ainda NÃO foi para a `main`/produção. Quando for, mesmo fluxo (`/deploy`).

> As migrations já estão no cloud (passo 0), então aqui é só código. Se fizer pelo `/deploy`, ele detecta que não há migration pendente e segue direto para o deploy do código.

---

## 2. Servidor (VPS): dividir o EnvironmentFile por serviço  ✅ CONCLUÍDO 2026-07-07

Reduz o raio de impacto (M1): hoje um arquivo único dá a cada processo os segredos do outro.

- [x] Feito: `api.env` e `zap.env` gerados por `grep` do `whaviso.env` (preserva os valores exatos, sem digitar segredo), 640 root:whaviso. Os units novos (que apontam para eles) foram copiados à mão para `/etc/systemd/system/` (o deploy NÃO instala systemd), `daemon-reload` + restart, api e zap confirmados de pé (healthz OK, zap conectado à Meta). Comando de referência original abaixo:
```bash
cp /opt/whaviso/app/deploy/whaviso-api.env.example /etc/whaviso/api.env
cp /opt/whaviso/app/deploy/whaviso-zap.env.example /etc/whaviso/zap.env
nano /etc/whaviso/api.env    # API_DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.
nano /etc/whaviso/zap.env    # ZAP_DATABASE_URL, META_*, SUPABASE_SERVICE_ROLE_KEY, SEND_CODE_HOOK_SECRET
chown root:whaviso /etc/whaviso/api.env /etc/whaviso/zap.env
chmod 640 /etc/whaviso/api.env /etc/whaviso/zap.env
systemctl daemon-reload && systemctl restart whaviso-api whaviso-zap
```
- [x] Após confirmar os dois serviços de pé, removidos o `whaviso.env` único **e** o `whaviso.env.bak` antigo (segredos velhos em texto puro):
```bash
rm -f /etc/whaviso/whaviso.env /etc/whaviso/whaviso.env.bak
```
> ATENÇÃO (aprendido em 2026-07-07): o `deploy.sh` NÃO instala systemd nem nginx. Os `.service` (e o nginx.conf, e os units do backup) são sempre **cópia manual** para `/etc/systemd/system/` + `daemon-reload`. A nota antiga dizia que vinham pelo deploy, o que estava errado.

---

## 3. Rotacionar segredos (raio de impacto do H1/M1)  [independe de deploy; só reiniciar serviços]

Faça idealmente junto com o passo 2 (já vai editar os env).

- [x] **`SUPABASE_SERVICE_ROLE_KEY`** (a mais importante: bypassa RLS + Admin API): no painel Supabase (Settings > API), regenerar; atualizar em **api.env E zap.env** (as duas cópias); reiniciar os dois serviços.
- [x] **`META_APP_SECRET` e `META_ACCESS_TOKEN`**: no App / System User da Meta, gerar novo; atualizar `zap.env`; reiniciar o zap.
- [x] **`SEND_CODE_HOOK_SECRET`**: gerar novo `v1,whsec_...`; colar no painel Supabase (Authentication > Hooks > Send SMS) E no `zap.env` (os dois lados têm que bater); reiniciar o zap.

> Enquanto o H1 (tirar a service_role do zap) não for feito, a service_role vive nos dois env e deve ser rotacionada nos dois juntos.

---

## 4. Firewall e bind das portas  🟡 ufw OK; bind da api corrigido, aguardando deploy (2026-07-07)

- [x] **ufw verificado (2026-07-07)**: default deny incoming; 22/SSH aberto; 80/443 só das faixas Cloudflare (IPv4+IPv6); 3001/3002 fora do allow (fechadas de fora). Correto.
- [ ] **bind**: a verificação de 2026-07-07 achou a **api em `0.0.0.0:3001`** (o zap já em `127.0.0.1:3002`). Não estava exposto (o ufw bloqueia a 3001), mas faltava a defesa em profundidade. **Corrigido no código** (`apps/api/src/env.ts` + `server.ts`: a api passa a bindar `127.0.0.1` por padrão, configurável por `API_HOST`, espelhando o zap). Precisa de **deploy** para valer; depois re-rodar e confirmar que os DOIS estão em loopback:
```bash
ss -tlnp | grep -E ':3001|:3002'   # ambos devem mostrar 127.0.0.1
ufw status verbose                 # so 22 + 80/443 das faixas Cloudflare
```

---

## 5. Validar a CSP e o login Google no site publicado  ✅ CONCLUÍDO 2026-07-07

A CSP foi endurecida para o Google Identity Services sem afrouxar. **Importante: o `deploy.sh`/GitHub Action NUNCA toca no nginx** (só faz `git pull` + `npm ci` + build da SPA + restart de api/zap). Uma mudança em `deploy/nginx/whaviso.conf` só chega ao servidor com uma cópia manual.

- [x] `whaviso.conf` copiado e recarregado no servidor:
```bash
cp /opt/whaviso/app/deploy/nginx/whaviso.conf /etc/nginx/sites-available/whaviso.conf
nginx -t && systemctl reload nginx
```
- [x] `curl -I https://whaviso.com`: CSP nova + HSTS + X-Frame-Options confirmados no documento. O bug de herança do `add_header` (as locations `= /index.html` e `/assets/` cancelavam os headers do `server{}`) foi corrigido no commit `1dfd8b5` e já está no ar. (Nos assets, o Cloudflare pode servir cópias em cache de antes do reload; renova sozinho no próximo deploy ou com Purge cache. Não é gap de segurança: o CSP do documento é o que vale.)
- [x] Login com Google validado no DevTools: **ZERO violação de CSP** (o hardening não quebrou o login). Avisos residuais (GIS init 2x, ZodError) tratados no commit `6562627`; o `Cross-Origin-Opener-Policy` é do lado do Google (accounts.google.com), benigno, nada a fazer.
- [ ] (Condicional, não ocorreu) Se algum dia o GIS puxar algo de `www.gstatic.com`, acrescentar ao `script-src`/`connect-src` e redeployar.

---

## 6. Painel do Supabase (configuração, não código)  ✅ CONCLUÍDO 2026-07-07 (2 exceções abaixo)

Itens do checklist de produção do Supabase que dependem do painel:

- [x] **Authentication > Rate Limits**: revisados; mantidos os defaults seguros (verificação de OTP 30/5min por IP; envio de SMS 30/h global). É a proteção real de brute-force do login (o OTP é validado pelo Supabase, não pela api).
- [x] **Tokens/Sessão**: **Refresh Token Rotation** + **Reuse Detection** ligados ("Detect and revoke potentially compromised refresh tokens" = ON, reuse interval 10s). Access token TTL no default (3600s).
- [x] **OTP expiry** <= 3600s: Phone 600s, Email 3600s.
- [x] **Database > Settings > SSL**: SSL Enforcement **ligado**.
- [ ] **Network Restrictions**: **risco aceito (2026-07-07), NÃO aplicar** por ora, o IPv4 do VPS muda (quebraria api/zap e o `db push`) e o comportamento com o pooler é inconsistente. Rever só com IP de saída estático.
- [x] **MFA na conta Supabase**: ligado, **2 fatores TOTP** configurados. (2º owner na org: só se houver 2ª pessoa de confiança; senão o essencial, não perder acesso, está coberto pela recuperação do GitHub, que é o provedor de login da conta Supabase, garanta 2FA + recovery codes no GitHub.)
- [x] **Backup diário** cobrindo o gap: ver passo 10 (instalado e no ar). **PITR/snapshots seguem indisponíveis no plano FREE.**
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

## 10. Backup próprio do banco (o gap de backup do plano FREE)  ✅ CONCLUÍDO 2026-07-07

O plano FREE do Supabase **não tem backup nenhum** (sem PITR, sem snapshot). O gap agora tem solução **no código**: uma rotina de `pg_dump` diária rodando no VPS por systemd timer (dumps em `/var/lib/whaviso/backups`, formato custom, rotação de 14 dias). Detalhes e o passo a passo completo em [../../deploy/README.md](../../deploy/README.md), seção "Backups do banco".

Passos manuais (**concluídos em 2026-07-07**; o script `deploy/scripts/backup-db.sh` já vem no checkout após o deploy):
- [x] Versão do Postgres do servidor descoberta: **17.6**. Como o Ubuntu 24.04 traz o `postgresql-client` 16 (que recusaria dumpar um servidor 17), instalado o **postgresql-client-17 pelo PGDG**; `PG_DUMP_BIN=/usr/lib/postgresql/17/bin/pg_dump`.
- [x] `/etc/whaviso/backup.env` criado a partir do exemplo, com a `BACKUP_DATABASE_URL` do **owner `postgres`** (Session pooler 5432, **nunca** a 6543). Dono **root:root, modo 600**.
- [x] Units `whaviso-backup.service` e `.timer` copiados, `daemon-reload`, **teste manual OK** (dump validado, ~460K) e **timer habilitado** (`enable --now`; NEXT ~06:20 UTC / 03:20 BRT diário, rotação 14 dias).
- [x] Procedimento de **restauração** documentado no próprio `deploy/scripts/restore-db.sh` (guia numerado de 6 passos + `-h` reimprime). Restore ainda não exercitado (só validação de integridade do dump via `pg_restore --list`); teste real de restauração num projeto novo fica como exercício futuro opcional.

> O dump é **sensível** (telefones, Pix, hashes de token): diretório 700, arquivos 600. Se enviar para fora da máquina (`BACKUP_REMOTE_CMD`), o destino tem que ser privado e criptografado. **PITR segue indisponível no FREE**: esta rotina é a rede de proteção enquanto não houver plano pago.
