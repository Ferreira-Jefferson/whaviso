# CI/CD do whaviso

Deploy automático na Hostinger via GitHub Actions. Companion do
[README.md](README.md) (provisionamento manual do VPS).

## Visão geral

- **`main` = o que está no ar.** Todo push na `main` que passe no gate dispara o
  deploy no VPS.
- **`development` = trabalho do dia a dia.** Você desenvolve nela (ou em features
  que saem dela). Publicar = merge/PR `development -> main`.
- Pipeline em [.github/workflows/cicd.yml](../.github/workflows/cicd.yml), 2 jobs:
  - **gate**: roda em push para `main`/`development` e em PR para `main`. Sobe um
    Postgres de serviço, reconstrói o banco de teste (shim + migrations + seed,
    igual ao `validate_migrations.sh`) e roda backend `lint` + `typecheck` +
    `test` e frontend `lint` + `build`. Se falhar, barra (e na `main`, não deploya).
  - **deploy**: só em push na `main`, só se o gate passar. Faz SSH no VPS e dispara
    o `deploy.sh` que já existe (puxa a `main`, `npm ci`, builda a SPA, publica,
    reinicia os serviços).

O gate roda num **Postgres efêmero local do runner**, não no Supabase: é rápido,
grátis, determinístico e o harness de teste foi feito pra isso (auth fake via
`test_shim_auth.sql`, roles `whaviso_api`/`whaviso_zap` com senhas `_dev` do seed).
Branch do Supabase serviria como ambiente de preview manual, não pro gate.

## Setup do deploy automático (uma vez)

O gate funciona assim que o workflow chega no GitHub, sem configuração. O **deploy**
precisa destes passos. Faça **um de cada vez**.

### 1. Gerar a chave de CI (no seu PC, nunca no VPS)

Chave dedicada ao CI, separada da sua pessoal, revogável a qualquer hora. Sem
passphrase (o Actions usa sem interação):

```bash
ssh-keygen -t ed25519 -C "whaviso-ci" -f ~/.ssh/whaviso_ci -N ""
```

Gera `~/.ssh/whaviso_ci` (privada, vai pro secret do GitHub) e
`~/.ssh/whaviso_ci.pub` (pública, vai pro VPS).

### 2. No VPS: liberar sudo só pro deploy.sh (logado como `deploy`)

O `deploy.sh` precisa de root (systemctl, `/var/www`). Liberamos `NOPASSWD`
**apenas** pra ele, sem abrir sudo geral:

O `deploy.sh` não tem bit de execução no git (`100644`), então invocamos via
`bash`. O sudoers libera exatamente `bash <caminho do deploy.sh>`, nada mais:

```bash
echo 'deploy ALL=(root) NOPASSWD: /usr/bin/bash /opt/whaviso/app/deploy/scripts/deploy.sh' \
  | sudo tee /etc/sudoers.d/whaviso-deploy
sudo chmod 440 /etc/sudoers.d/whaviso-deploy
sudo visudo -cf /etc/sudoers.d/whaviso-deploy   # deve dizer "parsed OK"
```

### 3. No VPS: autorizar a chave de CI travada por comando forçado

Cole o conteúdo de `whaviso_ci.pub` no `authorized_keys` do `deploy`, prefixado
pelas restrições. Assim, mesmo que a privada vaze, a chave **só** consegue rodar o
deploy (sem shell, sem port-forward):

```bash
# <CONTEUDO_DE_whaviso_ci.pub> = a linha inteira ssh-ed25519 AAAA... whaviso-ci
# Roda como root ou deploy (usa sudo e mira /home/deploy explicitamente). Uma vez so.
sudo mkdir -p /home/deploy/.ssh
echo 'command="sudo /usr/bin/bash /opt/whaviso/app/deploy/scripts/deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty <CONTEUDO_DE_whaviso_ci.pub>' \
  | sudo tee -a /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Sua chave pessoal continua com shell normal (entrada separada no mesmo arquivo);
a restrição vale só pra linha da chave de CI. Pra deploy manual, você ainda roda
`sudo bash /opt/whaviso/app/deploy/scripts/deploy.sh` logado normalmente.

### 4. Capturar o host key do VPS (no seu PC)

Pra fixar o host no `known_hosts` do runner (sem `StrictHostKeyChecking=no`):

```bash
ssh-keyscan -t ed25519 <IP_DO_VPS>
```

Guarde a linha de saída (`<IP> ssh-ed25519 AAAA...`).

### 5. Cadastrar os secrets no GitHub

Repo no GitHub: **Settings -> Secrets and variables -> Actions -> New repository secret**.

| Secret            | Valor                                                        |
|-------------------|--------------------------------------------------------------|
| `DEPLOY_SSH_KEY`  | conteúdo inteiro de `~/.ssh/whaviso_ci` (a chave privada)    |
| `DEPLOY_HOST`     | IP de origem do VPS (fica só aqui, preserva o esconde-IP)    |
| `SSH_KNOWN_HOSTS` | a linha do `ssh-keyscan` do passo 4                          |

O usuário (`deploy`) está fixo no workflow, não é secret.

### 6. (Opcional, recomendado) Proteger a main

Repo **Settings -> Branches -> Add branch ruleset** para `main`: exigir PR antes
do merge e exigir o check **gate** verde. Assim não entra código quebrado direto
na produção.

### 7. Primeiro deploy

Com os secrets no lugar, abra um PR `development -> main` (ou faça o merge). O push
resultante na `main` roda o gate e, verde, dispara o deploy.

## Operação no dia a dia

```bash
git checkout development
# ... trabalha, commita ...
git push                       # roda só o gate
# pronto pra publicar:
# abre PR development -> main no GitHub (ou git checkout main && git merge development && git push)
```

Acompanhe em **Actions** no GitHub. O deploy aparece como o job "Deploy na Hostinger".

## Rollback

O deploy é o estado da `main`. Pra voltar:

```bash
git revert <commit>            # ou git reset para um commit bom, com cuidado
git push                       # o push na main redeploya o estado revertido
```

Ou, manualmente no VPS, faça checkout de um commit anterior e rode o `deploy.sh`.

## Modelo de segurança (resumo)

- Quem controla a `main` controla o que roda como root no deploy (o `deploy.sh` vem
  do repo). É o modelo de qualquer CD: a `main` é a fonte de verdade do que publica.
  Por isso vale proteger a `main` (passo 6) e cuidar de quem tem push.
- A chave de CI é dedicada e travada por comando forçado + sudo escopado: vazou, só
  deploya, e você revoga removendo a linha do `authorized_keys`.
- O IP de origem fica só no secret; nada de DNS apontando pro VPS fora do Cloudflare.
- Sem actions de terceiros no workflow (só `checkout` e `setup-node` oficiais).
