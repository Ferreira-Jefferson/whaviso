# CLAUDE.md: whaviso

Automatize avisos de pagamento por WhatsApp e controle tudo pelo painel: o que está pendente, o que já recebeu, o que ainda vai pagar.

> **Fonte da verdade do produto/negócio: a pasta [historias/](historias/).** Toda regra de negócio (estados e transições, fluxos receber/pagar, convite e aceite, ciclo de lembretes, interação do devedor, confirmação de pagamento, painel, notificações, planos/limites, templates, linguagem e compliance) vive nas histórias de usuário, já verificadas e aprovadas. Este CLAUDE.md cobre **apenas** arquitetura, comandos e ferramentas de desenvolvimento, e **não define regra de negócio**. Se algo aqui contradisser uma história, a história vence. Na dúvida sobre comportamento do produto, leia `historias/` (comece por [historias/README.md](historias/README.md)), não este arquivo.

**Layout (dois projetos independentes, um checkout, deploy numa VPS, sem Vercel):**
- **`backend/`**: monorepo Node: `apps/api` (REST p/ SPA, :3001) · `apps/zap` (scheduler + webhook WhatsApp, :3002) · `packages/shared` (`@whaviso/shared`) · `supabase/` (migrations + seed) · `scripts/`. Workspace e install próprios.
- **`frontend/`**: SPA React+Vite **standalone** (install próprio; **não** importa `@whaviso/shared`, tem os contratos Zod próprios espelhando a api).

As três peças (frontend, `api`, `zap`) são **independentes**: o front só consome a API REST (nunca conhece implementação do backend); `api` e `zap` se integram pelo **banco Supabase compartilhado** (outbox), nunca importando um ao outro.

Leia sob demanda: regras de produto/negócio → [historias/](historias/) (fonte da verdade) · fronteiras/especialistas do backend → [backend/AGENTS.md](backend/AGENTS.md) · visão de produto (referência, pode estar desatualizada) → [PROJETO.md](PROJETO.md).

## Comandos (sempre verifique o trabalho)

`node`/`npm` estão no PATH do Windows (User + Machine): rode no **PowerShell** numa sessão nova, ou no **Bash**, tanto faz (o `concurrently` usa o `cmd.exe`, sempre presente no PowerShell). Se uma sessão antiga não achar o `npm`, reabra o terminal.

**Subir tudo localmente (raiz):** `npm run dev` sobe **api (:3001) + front (:5173)** juntos via `concurrently`. `npm run dev:all` inclui o `zap` (WhatsApp via Meta Cloud API oficial: a conexão é por credenciais `META_*` no `.env`, sem QR nem pareamento; sem as vars essenciais o zap encerra no boot). Primeira vez / após clone: `npm install` na raiz (pega o `concurrently`) + `npm run install:all` (deps do backend e do front). A raiz é só um lançador; `backend/` e `frontend/` seguem independentes.

**Backend** (rode de dentro de `backend/`):
```bash
cd backend
npm run lint        # ESLint + fronteiras feature-first  ── rode os 3 a cada mudança
npm run typecheck   # tsc --noEmit (3 workspaces)
npm test            # vitest (api + zap + shared); conecta ao banco whaviso_dev

bash scripts/validate_migrations.sh whaviso_dev   # recria o banco de DEV (Postgres LOCAL, sem Docker); RODE ISTO se mexer no schema
# ATENÇÃO: o runtime api+zap de DEV aponta para o Supabase CLOUD, não para o whaviso_dev local (só os testes usam o local).
# Mudança de schema OU de dados de catálogo (ex.: planos) só aparece no app depois de aplicar no CLOUD via `supabase db push`
# (session pooler 5432; ver memória [[whaviso-dev-db]]). O seed NÃO roda no cloud → dados de catálogo vão em MIGRATION (upsert), não no seed.
npm run dev:api          # :3001  (CORS liberado p/ APP_URL)
npm run dev:zap          # :3002  (WhatsApp via Meta Cloud API; conexão por credenciais META_* no .env, sem QR)
curl 127.0.0.1:3001/healthz   # use 127.0.0.1 (há outro app no ::1 desta máquina)
./scripts/scaffold_module.sh <api|zap> <nome>     # novo módulo (depois: 1 linha em src/routes.ts)
```

> **Regra de commit + migrations no cloud:** ao fazer um `git commit` que envolva migrations novas ou alteradas, **pergunte** se deve também aplicar essas migrations no Supabase **cloud** (`supabase db push`, session pooler 5432, rodando de dentro de `backend/`). Nem o `git commit` nem o `git push` aplicam migration: esquema e dados de catálogo (ex.: planos) só mudam no app depois do `db push` no cloud.

**Frontend** (rode de dentro de `frontend/`): `npm run dev` (Vite, :5173) · `npm run build` (estáticos p/ nginx na VPS) · `npm run lint` · `npm run typecheck`.

Quirks desta máquina (Bash + Postgres no Windows): caminho do `psql` tem espaço → chame via função com aspas, não `$VAR`. Ao capturar saída do `psql`: `export PGCLIENTENCODING=UTF8` e `tr -d '\r'`. Se o `npm install` bloquear postinstall: `npm approve-scripts esbuild unrs-resolver && npm rebuild esbuild unrs-resolver`. Senha do superusuário Postgres em `backend/.env` (`POSTGRES_PASSWORD`). Env local: `backend/.env` (serve api+zap, vars prefixadas `API_*`/`ZAP_*`) e `frontend/.env` (`VITE_*`).

Estado do projeto e pendências (Supabase cloud, app Meta, secrets/VPS): ver memória [[whaviso-dev-db]].

## Graphify (mapa do código, use sempre)

Existe um grafo de conhecimento do projeto em `graphify-out/` (`graph.json`, `graph.html`, `GRAPH_REPORT.md`), gerado pela skill `/graphify`. Ferramenta de DEV, não é dependência do app. Setup desta máquina em [[whaviso-graphify]].

- **ANTES de qualquer análise ou alteração de código**, consulte o grafo primeiro para entender estrutura, dependências e quem chama quem, de forma mais eficiente e correta que ler/grepar arquivos no escuro. Use `/graphify query "<pergunta>"` (subgrafo focado), `/graphify path "<A>" "<B>"` (caminho entre dois pontos) ou `/graphify explain "<conceito>"`. Só leia/grep arquivos crus depois que o grafo orientou, ou para mexer/depurar linhas específicas.
- **DEPOIS de toda mudança de código**, atualize o grafo: `/graphify . --update` (reextrai só os arquivos novos/alterados). Mantém o mapa em dia com o código.
- Os hooks em `.claude/settings.json` já cutucam esse fluxo quando `graphify-out/graph.json` existe. Vale para subagents também: inclua a regra no prompt deles ao explorar código.

## Arquitetura e stack (decisões técnicas, não reverter sem combinar)

Decisões de **engenharia**. Não são regra de negócio (essas estão em `historias/`).

- Supabase = **Postgres + Auth apenas**. Sem Edge Functions; sem PostgREST p/ dados (RLS deny-all p/ anon/authenticated). Frontend usa `supabase-js` só p/ login; dados 100% via `api`.
- Backend: só Node.js; Fastify + TS estrito + Zod; runtime `tsx` (sem build/emit). JWT do Supabase validado localmente via JWKS na api.
- WhatsApp via **Meta Cloud API oficial** (canal sancionado para mensagem de negócio: templates aprovados + janela de 24h; inbound por webhook), rodando no próprio `zap`. O provider fica isolado atrás da interface `ClienteWhats` no `zap` (`shared/meta_client/`) para que trocar de versão ou detalhe do transporte seja pontual. Evite provedores não oficiais (Z-API/Evolution). (Quais recursos dependem de aprovação/verificação na Meta é regra de produto, ver `historias/`.)
- Frontend: **React 19 + Vite 7 + TS estrito + Tailwind v4**, SPA puro; estado de servidor via TanStack Query; contratos Zod **próprios** (não compartilha pacote com o backend).
- Integração entre serviços = banco compartilhado + outbox (`envios`, `notificacoes_cobrador`): quem produz só **enfileira**, o consumidor **drena/envia**, com claim `FOR UPDATE SKIP LOCKED`. Sem fila/Redis.
- Roles de privilégio mínimo (`whaviso_api`/`whaviso_zap`); **sem DELETE em auditoria/negócio** (tabelas de negócio mudam de estado, nunca somem; auditoria é append-only). **Exceção:** `templates` é configuração, não auditoria → `whaviso_api` tem DELETE só nessa tabela (com guarda na api).
- **Módulo nunca importa módulo** (lint barra): vale no backend e no front; coordene via banco/contrato. Detalhes em [backend/AGENTS.md](backend/AGENTS.md).

## Convenções de engenharia (causam bug se ignoradas)

- Dinheiro em **centavos** (int); datas de negócio em **America/Sao_Paulo**, banco em UTC. Etapa/agendamento nunca calculados no cliente.
- Tokens **só como hash sha256** no banco (claro nunca persiste).
- Erros da api: envelope `{ error: { code, message } }`.
- **Nunca logar** dado sensível: telefone (devedor **e** cobrador), Pix/titular/banco, token, número de convite (a redaction de log cobre campos aninhados).

## Convenções de escrita do repositório

Valem para tudo que você escreve (código, comentários, commits, docs). Não são regra de negócio, mas são inegociáveis:

- **Nunca usar travessão (—, em dash)** em texto algum: prefira vírgula, dois-pontos, parênteses ou reescreva a frase. (A linguagem das mensagens ao usuário, palavras proibidas e gênero neutro, é regra de produto: ver `historias/13-compliance.md`.)
- **Nenhum modelo de IA (Claude, Anthropic, etc.) pode aparecer como autor ou co-autor** em commits nem em qualquer lugar do projeto. Proibido: trailer `Co-Authored-By: Claude...`, rodapés tipo `Generated with Claude Code`, ou menção a modelo/IA em mensagens de commit, código, comentários e docs. Commits saem **apenas** no nome do humano (autor do git).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
