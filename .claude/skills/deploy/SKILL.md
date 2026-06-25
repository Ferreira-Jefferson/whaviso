---
name: deploy
description: "Faz o release de produção do whaviso de ponta a ponta: aplica as migrations pendentes no Supabase cloud, dispara o deploy na Hostinger (GitHub Action na branch main), valida que tudo subiu (SPA, api, serviços) e volta o repo para a branch development. Use quando o usuário pedir 'faça o deploy', 'deploy', 'publicar', 'subir pra produção', 'colocar no ar' ou 'release'."
---

# deploy

Orquestra o release de produção inteiro do whaviso, na ordem certa, e valida o
resultado. `main` é o que está no ar; `development` é o trabalho do dia a dia.
A fonte de verdade da infra é [deploy/CICD.md](../../../deploy/CICD.md) e as
memórias [[whaviso-cicd]], [[whaviso-dev-db]], [[whaviso-infra-deploy]]; leia sob
demanda, esta skill é o roteiro de execução.

## Quando usar

Quando o usuário pedir "faça o deploy", "deploy", "publicar", "subir pra produção",
"colocar no ar" ou "release".

## Princípios (não furar)

- **Ordem: Supabase ANTES do código.** O código novo pode depender do schema novo;
  aplicar a migration no cloud primeiro evita api 500 / "coluna não existe" (ver a
  LIÇÃO em [[whaviso-dev-db]]). Migration é aditiva/idempotente neste projeto.
- **Nunca deployar com o gate vermelho.** O deploy na Hostinger só roda se o gate
  passar; não force.
- **Nunca logar nem ecoar segredos:** `SUPABASE_PASSWORD`, connection strings com
  senha, conteúdo da chave de CI. Ao mostrar uma URL de conexão, mascare a senha
  (`sed -E 's#:[^:@/]+@#:REDACTED@#'`).
- **Passo a passo, confirmando nos pontos de não-retorno.** Push na `main` = publicar
  em produção: confirme com o usuário antes. Ver [[feedback-cadencia-passo-a-passo]].
- **Sem travessão** em nenhum texto/commit; **nenhuma IA como autor/co-autor** de commit.
- **Ao concluir, volte o repo para `development`** (passo final, obrigatório).

## Pré-requisitos (já configurados nesta máquina)

- `backend/.env` com `SUPABASE_PASSWORD` (senha do banco cloud, pooler session).
- Deploy automático de pé: chave de CI no VPS + 3 secrets no GitHub
  (`DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `SSH_KNOWN_HOSTS`). Detalhes em deploy/CICD.md.
- Opcional, para automação total: `gh` instalado e autenticado. Sem ele, a skill
  dispara o deploy por push na `main` e valida por curl, pedindo ao usuário que
  confirme o status na aba Actions (ele enxerga o run, a skill não lê o log sem gh).

## Passo 1: Diagnóstico (o que precisa ir?)

Levante o estado antes de mexer em nada:

- **Git:** branch atual, `development` está à frente da `main`? Há mudança não
  commitada? (`git -C <raiz> status -sb`, `git log --oneline origin/main..development`).
- **Supabase:** há migration pendente no cloud? (passo 2, com `--dry-run`).

Decida o escopo:
- **Só migration mudou** (nenhum código novo): faça o passo 2 e PARE. Os serviços
  já apontam pro cloud, a mudança de schema fica viva sem redeploy (ver [[whaviso-dev-db]]).
- **Só código mudou** (nada pendente no cloud): pule o passo 2, vá pro passo 3.
- **Ambos:** passo 2, depois passo 3.

## Passo 2: Supabase (migrations no cloud)

Rode **de dentro de `backend/`** (senão `. ./.env` não acha o arquivo, a senha sai
vazia e dá SASL auth fail). Primeiro o dry-run para ver o que subiria:

```bash
cd backend
set -a; . ./.env; set +a
npx --yes supabase db push \
  --db-url "postgresql://postgres.exxczsyjvgjsxmwlrwww:${SUPABASE_PASSWORD}@aws-1-us-east-1.pooler.supabase.com:5432/postgres" \
  --dry-run
```

- **Pooler SESSION porta 5432** (não a 6543, que é transaction, do runtime). O host
  direto `db.<ref>.supabase.co` é IPv6-only e não conecta desta máquina.
- Se o dry-run lista migrations pendentes e o usuário confirmar, aplique (sem
  `--dry-run`, com `--yes`). `db push` aplica **todas** as pendentes em ordem.
- Se não há pendentes: reporte "cloud já está em dia" e siga.
- `db push` **não roda o seed**. Dados de catálogo (planos etc.) têm que estar em
  migration como UPSERT idempotente, nunca no `seed.sql`.

## Passo 3: Hostinger (código, via GitHub Action)

O deploy na Hostinger é a Action disparada por push na `main` (ou por
`workflow_dispatch`). Há código novo a publicar:

```bash
git -C <raiz> checkout main
git -C <raiz> merge --ff-only development      # development -> main, fast-forward
git -C <raiz> push origin main                 # dispara gate + deploy
```

(Alternativa idiomática: abrir PR `development -> main` no GitHub.) **Confirme com o
usuário antes do push na `main`**, é o ato que publica em produção.

Forçar re-deploy do mesmo código (sem commit novo): disparar `workflow_dispatch`
(botão "Run workflow" na Action, branch `main`, ou `gh workflow run cicd.yml --ref main`).

Acompanhar o run:
- **Com `gh`:** `gh run watch` no run mais recente da `main`; leia o job
  "Deploy na Hostinger".
- **Sem `gh`:** diga ao usuário pra acompanhar em
  `https://github.com/Ferreira-Jefferson/whaviso/actions` (run da `main`) e reportar
  o status dos 2 jobs. O deploy só roda se o gate ficar verde.

## Passo 4: Validação (no fim, sempre)

Confirme o resultado vivo (passa por Cloudflare -> VPS, alcançável do PC):

```bash
curl -sS -m 20 -o /dev/null -w "spa=%{http_code}\n" https://whaviso.com
curl -sS -m 20 https://api.whaviso.com/healthz    # espera {"ok":true,"servico":"api"}
```

- SPA deve dar `200`; healthz deve dar `{"ok":true,"servico":"api"}`.
- Com `gh`: confirme os 2 jobs verdes. Sem `gh`: confie no relato do usuário + nesse curl.
- Emita um resumo claro **PASS/FAIL** do que foi aplicado (migrations) e publicado (código).

Se o job de deploy falhar, reproduza o deploy do PC com a chave de CI para ver o log
inteiro e diagnosticar (roda o mesmo comando forçado = `deploy.sh`):

```bash
ssh -i ~/.ssh/whaviso_ci -o IdentitiesOnly=yes deploy@<IP de origem>
```

O `<IP de origem>` é o mesmo do secret `DEPLOY_HOST`; **não versione esse IP** (some
do Cloudflare-hiding). Se não souber, peça ao usuário.

## Passo 5: Voltar para a development (obrigatório)

Ao concluir, deixe o repo pronto pro próximo trabalho:

```bash
git -C <raiz> checkout development
git -C <raiz> merge --ff-only main     # mantem development = estado publicado (no-op se ja igual)
```

## Sintomas conhecidos

- Front "Não foi possível carregar os planos" / api 500 em `GET /v1/billing/planos`
  → migration de catálogo não aplicada no cloud. Fix: passo 2.
- `gate` vermelho → não deploya. Corrija na `development`, valide, repita.
- SASL auth fail no `db push` → rodou fora de `backend/` (senha vazia) ou usou a
  porta errada do pooler (use a **5432** session).
