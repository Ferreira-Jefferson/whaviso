# CLAUDE.md: whaviso

Automatize avisos de pagamento por WhatsApp e controle tudo pelo painel: o que está pendente, o que já recebeu, o que ainda vai pagar.

**Layout (dois projetos independentes, um checkout, deploy numa VPS, sem Vercel):**
- **`backend/`**: monorepo Node: `apps/api` (REST p/ SPA, :3001) · `apps/zap` (scheduler + webhook WhatsApp, :3002) · `packages/shared` (`@whaviso/shared`) · `supabase/` (migrations + seed) · `scripts/`. Workspace e install próprios.
- **`frontend/`**: SPA React+Vite **standalone** (install próprio; **não** importa `@whaviso/shared`, tem os contratos Zod próprios espelhando a api). Em construção.

As três peças (frontend, `api`, `zap`) são **independentes**: o front só consome a API REST (nunca conhece implementação do backend); `api` e `zap` se integram pelo **banco Supabase compartilhado** (outbox), nunca importando um ao outro.

Leia sob demanda: produto → [PROJETO.md](PROJETO.md) · fronteiras/especialistas do backend → [backend/AGENTS.md](backend/AGENTS.md) · planos → [backend](../../../.claude/plans/voc-ser-o-respons-vel-partitioned-leaf.md), [frontend](../../../.claude/plans/aqui-criaremos-o-plano-compiled-aurora.md).

## Comandos (sempre verifique o trabalho)

`node`/`npm` estão no PATH do Windows (User + Machine): rode no **PowerShell** numa sessão nova, ou no **Bash**, tanto faz (o `concurrently` usa o `cmd.exe`, sempre presente no PowerShell). Se uma sessão antiga não achar o `npm`, reabra o terminal.

**Subir tudo localmente (raiz):** `npm run dev` sobe **api (:3001) + front (:5173)** juntos via `concurrently`. `npm run dev:all` inclui o `zap` (que agora sobe sem credenciais Meta: o WhatsApp é via Baileys, pareado por QR no 1º boot, ver `WHATS_*` no `.env`). Primeira vez / após clone: `npm install` na raiz (pega o `concurrently`) + `npm run install:all` (deps do backend e do front). A raiz é só um lançador; `backend/` e `frontend/` seguem independentes.

**Backend** (rode de dentro de `backend/`):
```bash
cd backend
npm run lint        # ESLint + fronteiras feature-first  ── rode os 3 a cada mudança
npm run typecheck   # tsc --noEmit (3 workspaces)
npm test            # vitest (api 18 + zap 14 + shared 10); conecta ao banco whaviso_dev

bash scripts/validate_migrations.sh whaviso_dev   # recria o banco de DEV (Postgres LOCAL, sem Docker); RODE ISTO se mexer no schema
# ATENÇÃO: o runtime api+zap de DEV aponta para o Supabase CLOUD, não para o whaviso_dev local (só os testes usam o local).
# Mudança de schema OU de dados de catálogo (ex.: planos) só aparece no app depois de aplicar no CLOUD via `supabase db push`
# (session pooler 5432; ver memória [[whaviso-dev-db]]). O seed NÃO roda no cloud → dados de catálogo vão em MIGRATION (upsert), não no seed.
npm run dev:api          # :3001  (CORS liberado p/ APP_URL)
npm run dev:zap          # :3002  (WhatsApp via Baileys; pareie pelo QR no 1º boot, ver WHATS_* no .env)
curl 127.0.0.1:3001/healthz   # use 127.0.0.1 (há outro app no ::1 desta máquina)
./scripts/scaffold_module.sh <api|zap> <nome>     # novo módulo (depois: 1 linha em src/routes.ts)
```

**Frontend** (rode de dentro de `frontend/`): `npm run dev` (Vite, :5173) · `npm run build` (estáticos p/ nginx na VPS) · `npm run lint` · `npm run typecheck`.

## Graphify (mapa do código, use sempre)

Existe um grafo de conhecimento do projeto em `graphify-out/` (`graph.json`, `graph.html`, `GRAPH_REPORT.md`), gerado pela skill `/graphify`. Ferramenta de DEV, não é dependência do app. Setup desta máquina em [[whaviso-graphify]].

- **ANTES de qualquer análise ou alteração de código**, consulte o grafo primeiro para entender estrutura, dependências e quem chama quem, de forma mais eficiente e correta que ler/grepar arquivos no escuro. Use `/graphify query "<pergunta>"` (subgrafo focado), `/graphify path "<A>" "<B>"` (caminho entre dois pontos) ou `/graphify explain "<conceito>"`. Só leia/grep arquivos crus depois que o grafo orientou, ou para mexer/depurar linhas específicas.
- **DEPOIS de toda mudança de código**, atualize o grafo: `/graphify . --update` (reextrai só os arquivos novos/alterados). Mantém o mapa em dia com o código.
- Os hooks em `.claude/settings.json` já cutucam esse fluxo quando `graphify-out/graph.json` existe. Vale para subagents também: inclua a regra no prompt deles ao explorar código.

Quirks desta máquina (Bash + Postgres no Windows): caminho do `psql` tem espaço → chame via função com aspas, não `$VAR`. Ao capturar saída do `psql`: `export PGCLIENTENCODING=UTF8` e `tr -d '\r'`. Se o `npm install` bloquear postinstall: `npm approve-scripts esbuild unrs-resolver && npm rebuild esbuild unrs-resolver`. Senha do superusuário Postgres em `backend/.env` (`POSTGRES_PASSWORD`). Env local: `backend/.env` (serve api+zap, vars prefixadas `API_*`/`ZAP_*`) e `frontend/.env` (`VITE_*`).

## Regras inegociáveis

**Produto (regras de ouro):**
- **NUNCA** usar "dívida", "devendo", "atraso", "cobrança", "inadimplência"; sempre "aviso/lembrete/combinado". Vale no banco, na api, **e na UI**. Ao mudar o padrão, atualizar **juntos** a migration `0006`, o `contracts/linguagem.ts` do backend e o dicionário de linguagem do front.
- Opt-out visível em toda mensagem; estado terminal (pago/cancelado/expirado) **nunca mais envia**; devedor só interage por botões (sem chat/IA/Pix automático).
- **Nunca usar travessão (—, em dash)** em texto algum (código, copy, comentários, mensagens, docs): é marca de texto gerado por IA. Prefira vírgula, dois-pontos, parênteses ou reescreva a frase.
- **Nenhum modelo de IA (Claude, Anthropic, etc.) pode aparecer como autor ou co-autor** em commits nem em qualquer lugar do projeto. Proibido: trailer `Co-Authored-By: Claude...`, rodapés tipo `Generated with Claude Code`, ou menção a modelo/IA em mensagens de commit, código, comentários e docs. Commits saem **apenas** no nome do humano (autor do git).

**Stack/arquitetura (decididas, não reverter sem combinar):**
- Supabase = **Postgres + Auth apenas**. Sem Edge Functions; sem PostgREST p/ dados (RLS deny-all p/ anon/authenticated). Frontend usa `supabase-js` só p/ login; dados 100% via `api`.
- **Login SEM e-mail/senha (2026-06-17):** só **Google OAuth** + **WhatsApp OTP** (cadastro fundido no login; sem páginas de senha). Motivo: fugir do limite de e-mail do SMTP do Supabase. Ambos cabem no **plano free**. O OTP do telefone (gerado pelo Supabase Auth) é entregue pelo **nosso WhatsApp** via **Send SMS Hook** → endpoint `POST /hooks/sms` no `zap` (módulo `hook_otp`, assinatura Standard Webhooks `SEND_SMS_HOOK_SECRET`). JWT continua sendo do Supabase (validado por JWKS na api). **Gated:** entrega de OTP a +55 exige verificação de empresa Meta + template de Autenticação aprovado; o `zap` precisa estar público (a nuvem do Supabase chama o hook). Google funciona sem Meta. Config de painel (Google Cloud + Supabase Providers/Hooks) é manual, ver `.claude/plans/whaviso-auth-otp-telefone.md`.
- Backend: só Node.js; Fastify + TS estrito + Zod; runtime `tsx` (sem build/emit). WhatsApp **por enquanto via Baileys** (não oficial, roda no próprio `zap`): é o provider atual até a base chegar a ~100 clientes. A partir daí migramos para a **Meta Cloud API oficial** (alvo final; é o que destrava as fases gated: convite por template com botões, OTP de telefone, `informado_pago`). Isole o provider atrás de uma interface de envio no `zap` para a troca ser pontual. Evite Z-API/Evolution.
- Frontend: **React 19 + Vite 7 + TS estrito + Tailwind v4**, SPA puro; estado de servidor via TanStack Query; contratos Zod **próprios** (não compartilha pacote com o backend).
- Integração entre serviços = banco compartilhado + outbox (`envios` p/ lembretes; `notificacoes_cobrador` p/ avisar o cobrador quando o devedor informa pagamento: a `api` só enfileira, o `zap` drena/envia), claim `FOR UPDATE SKIP LOCKED`. Sem fila/Redis.
- Roles de privilégio mínimo (`whaviso_api`/`whaviso_zap`); **sem DELETE em auditoria/negócio** (`eventos_aviso` é append-only; `avisos`/`envios`/`profiles` mudam de estado, nunca somem — "suspender" em vez de apagar). **Exceção:** `templates` (tabela unificada de mensagens por chave) é configuração, não auditoria → o owner pode apagar versões; `whaviso_api` tem DELETE só nessa tabela (guarda na api: nunca apaga a versão ativa). JWT validado localmente via JWKS.
- **Módulo nunca importa módulo** (lint barra): vale no backend e no front; coordene via banco/contrato. Detalhes em backend/AGENTS.md.

**Convenções que causam bug se ignoradas:**
- Dinheiro em **centavos** (int); datas de negócio em **America/Sao_Paulo**, banco em UTC. Etapa/agendamento nunca calculados no cliente.
- Tokens **só como hash sha256** no banco (claro nunca persiste). Botão do WhatsApp leva **`aviso_id`** no payload (webhook é HMAC-autenticado), não o token.
- Erros da api: envelope `{ error: { code, message } }`. **Nunca logar** telefone/Pix/token.
- Transições válidas de `avisos` (renomeado `pendente`→`programado` em F-STATE/migration `0028`): `sem_aviso→{aguardando_aceite,cancelado,pago}`, `aguardando_aceite→{programado,cancelado,expirado,recusado}`, `programado→{informado_pago,pago,cancelado,expirado,pausado,aguardando_aprovacao_aviso_editado,desregistrado}`, `informado_pago→{pago,programado,cancelado,expirado}`, `pago→programado` (reabertura), `pausado→{programado,cancelado,expirado}`, `aguardando_aprovacao_aviso_editado→{programado,cancelado,expirado}`, `desregistrado→{programado,cancelado,expirado}` (trigger + app). Terminais: `pago` (salvo reabertura), `cancelado`, `recusado`, `expirado`; suspensão (param envios, não terminais): `pausado`/`aguardando_aprovacao_aviso_editado`/`desregistrado`. `informado_pago`: devedor informou que pagou, aguardando o cobrador confirmar; cobrador confirma (→pago) ou rejeita (→programado, evento `rejeitado_cobrador`).
- **Dois fluxos, mesma maquinaria de convite/aceite** (migration `0017`): `receber` (criador = cobrador, convida o devedor) e `pagar` **invertido** (criador = devedor, convida o cobrador; *não* é mais lembrete a si mesmo). Por isso `avisos.cobrador_id` é **nullable** e há `criador_papel`/`nome_cobrador`/`telefone_cobrador`. Convenção de telefones: `telefone_devedor` = sempre o alvo dos lembretes; `telefone_cobrador` = alvo do convite no invertido. Painel é por **papel** (a receber = sou cobrador; a pagar = sou devedor), não por direção.
- **Aceite sem conta, pelo WhatsApp**: o convidado confirma pelo botão do WhatsApp (webhook, sem login, payloads `aceite`/`recusa:aviso_id`) **ou** pela página pública `/aceite/:token` (`POST` sem `autenticar`, sessão opcional via `autenticarOpcional`). Sem conta, fica vinculado **só pelo telefone**; com sessão, vincula o `profile.id`. No invertido o cobrador informa sua chave Pix ao confirmar. CTA discreta de criar conta no pós-aceite (nunca obrigatória).
- **Gated (ainda não ligado):** (1) **auto-envio do convite** como template Meta com botões Aceitar/Recusar; hoje o convite é compartilhado por link `wa.me` + página pública (mesma dependência das fases gated do `informado_pago`); (2) **backfill por telefone no signup** (puxar os whavisos de um número ao criar conta) exige **OTP de telefone**, que ainda não existe; não ligar ao `PATCH /perfil` (não verificado) sob risco de sequestro de combinados. Ver memória [[whaviso-pagar-invertido]].

Estado do projeto e pendências (Supabase cloud, app Meta, secrets/VPS): ver memória [[whaviso-dev-db]].

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
