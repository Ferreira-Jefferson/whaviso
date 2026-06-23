# Plano de desenvolvimento: Épico 01 — Conta & Autenticação

> Fonte da verdade: `historias/01-conta-autenticacao.md`. Onde o código atual diverge da história, o trabalho é **mudar o código/doc para bater com a história**.
> Estado do código inspecionado em 2026-06-22 (graphify CLI indisponível; baseado em leitura direta do código + GRAPH_REPORT).

---

## 1. Resumo do épico e escopo

Login **sem e-mail/senha**, com duas portas de entrada e a identidade ancorada no número de WhatsApp:

- **H1.1 Google OAuth** — 🟢 MVP, já funciona.
- **H1.2 Login pelo WhatsApp (número já cadastrado)** — 🟢 MVP segundo o épico, mas com **divergência central de UX** (botão vs OTP, ver decisão em aberto).
- **H1.3 Cadastro pelo WhatsApp (número novo)** — 🟢 MVP, mesma divergência.
- **H1.4 Conta criada automaticamente no aceite** — 🟢 MVP; hoje só vincula por telefone/sessão, **não cria conta** (divergência).
- **H1.5 Plano free só-leitura** — 🟢 MVP; hoje **não existe plano free** e a API deixa criar (divergência crítica de segurança/produto).
- **H1.6 Sessão validada por JWKS na API** — 🟢 já feito.
- **H1.7 Manter sessão e sair** — 🟢 já feito.

Tudo é MVP 🟢 segundo o épico (o canal WhatsApp é viável via Baileys; Meta oficial é troca de transporte futura, fora de escopo). **Não há fatia 🟡 gated neste épico.** O que separa "fácil" de "difícil" aqui é o **modelo de sessão do login por WhatsApp** (H1.2/H1.3) e a **criação de conta no aceite** (H1.4), que esbarram em como o Supabase emite (ou não) o JWT.

---

## 2. Estado atual vs história (por critério)

Legenda: `[x]` ok · `[~]` parcial · `[!]` diverge (refatorar) · `[+]` não existe.

### H1.1 Entrar com Google
- `[x]` Botão "Entrar com Google" inicia OAuth do Supabase — `frontend/src/modules/auth/components/GoogleLoginButton.tsx` + `signInWithGoogleIdToken` em `frontend/src/shared/supabase/client.ts` (usa Google Identity Services + `signInWithIdToken`, sem redirect ao supabase.co).
- `[x]` Perfil criado automaticamente no 1º login — trigger `handle_new_user` em `0002_profiles.sql` (`after insert on auth.users`).
- `[x]` Sessão ativa ao voltar e painel carrega — `AuthProvider` resolve sessão + `GET /v1/perfil`.
- `[x]` Nenhuma tela de senha — login só tem Google (WhatsApp atrás de flag).

### H1.2 Entrar pelo WhatsApp (já cadastrado)
- `[~]` Informo o telefone na tela de login — formulário existe (`Login.tsx`, `telefoneOtpSchema`), **mas atrás de `WHATSAPP_LOGIN_ATIVO = false`**.
- `[!]` Mensagem com botões **Acessar / Negar acesso** — diverge: o código manda **OTP de 6 dígitos** (`hook_otp`, `signInWithOtp`/`verifyOtp`), não botões. Texto fixo `textoOtp` em `backend/apps/zap/src/modules/hook_otp/index.ts`.
- `[!]` Tocar **Acessar** cria a sessão — não existe; o usuário **digita o código**.
- `[+]` Tocar **Negar acesso** recusa e registra evento — não existe (não há evento de login negado).
- `[~]` Só envia para número **com cadastro** — hoje o `signInWithOtp` do Supabase emite OTP a qualquer número (com `shouldCreateUser` padrão cria conta). Não há gate "existe cadastro?".

### H1.3 Cadastro pelo WhatsApp (número novo)
- `[+]` Mensagem *"…tentativa de cadastro…"* com **Sim, sou eu / Não fui eu** — não existe; o fluxo atual é o mesmo OTP de login.
- `[+]` Tocar **Sim, sou eu** cria conta e acessa — não existe.
- `[+]` Tocar **Não fui eu** aborta e registra evento — não existe.
- `[+]` Nos acessos seguintes vira o fluxo de login (H1.2) — não existe a distinção cadastro vs login.

### H1.4 Conta criada automaticamente no aceite
- `[!]` Conta criada por baixo dos panos com número+nome — **não cria conta**. `aceite/service.ts` só grava `devedor_profile_id`/`cobrador_id` **se houver sessão** (`autenticarOpcional`); sem sessão fica vinculado **só por telefone** (backfill no PATCH /perfil). Nenhum `auth.users`/`profiles` é criado no aceite.
- `[+]` Link convidando a acompanhar no painel junto da confirmação — não existe CTA de pós-aceite com link de acesso.
- `[+]` 1º uso do link → confirmação pelo WhatsApp (login H1.2) — depende de H1.2/H1.4 reescritos.
- `[~]` Conta entra no plano free (só leitura) — depende de H1.5 (plano free não existe).
- `[x]` Se recusar/ignorar, nada fica pendente de ação obrigatória — recusa via webhook só marca `cancelado`/grava evento; CTA de conta é opcional por desenho.

### H1.5 Plano free só-leitura
- `[!]` Free **vê** combinados como devedor/cobrador — leitura por participação já existe (`listarAvisos` filtra `cobrador_id = $1 or devedor_profile_id = $1`), **mas não há "plano free":** sem assinatura o default é `pessoal` (10 avisos), `0019_billing_personalizado.sql`.
- `[!]` Free **não cria**; ação leva a CTA de plano — diverge: `criarAviso` em `avisos/service.ts` usa `limiteDoPlano`, que retorna 10 para quem não tem assinatura → **a conta nova cria avisos livremente**. Não há estado read-only.
- `[!]` Regra aplicada na **API** com envelope de erro — o envelope existe (`regraNegocio('limite_plano_atingido', …)`), mas o código não exige plano pago: precisa de um código de erro tipo `plano_sem_criacao` e limite 0/leitura no free.
- `[x]` Detalhe de limites fica no E11 — ok, este épico só garante o "free = read-only" na API.

### H1.6 Sessão validada localmente na API (JWKS)
- `[x]` Rota protegida exige `Bearer` e valida por JWKS — `apps/api/src/shared/auth/index.ts` (`createRemoteJWKSet` + `jwtVerify`, issuer Supabase).
- `[x]` Token inválido/expirado → 401 com envelope — `naoAutorizado()` via `http_errors`.
- `[x]` Rotas públicas sem JWT com mecanismo próprio — webhook HMAC (`webhook_whatsapp`), hook OTP (Standard Webhooks), aceite por token. ✔

### H1.7 Manter sessão e sair
- `[x]` Sessão persiste no reload — `createClient(..., { auth: { persistSession: true, autoRefreshToken: true } })`.
- `[x]` Ação de sair encerra a sessão e redireciona — `AppShell.tsx` (`sair()` → `signOut()`), `AuthProvider.signOut`.

**Resumo:** já OK = H1.1, H1.6, H1.7. Parcial/diverge = H1.2, H1.3 (UX botão vs OTP), H1.4 (criação de conta no aceite), H1.5 (free read-only). 3 critérios já OK, ~6 divergem, ~7 faltam.

---

## 3. Trabalho por camada

> ⚠️ **Bloqueio de decisão:** o grosso de H1.2/H1.3 depende da decisão **botão vs OTP** (seção 7). O plano abaixo descreve as duas trilhas; a equipe escolhe **uma** antes de implementar. A trilha recomendada é **OTP por código** (caminho de menor risco: o Supabase emite o JWT pronto e o transporte já está construído). A trilha "botão" exige a gente emitir/gerenciar JWT, o que contraria a regra "JWT continua sendo do Supabase".

### Arquitetura / Dados (migrations, estados, índices)
- **Plano `free` no catálogo (H1.5):** nova migration (próximo número livre, **0025**) que faz UPSERT de um plano `free` com `max_avisos_ativos = 0` (ou flag `somente_leitura`), idempotente, no padrão da `0019`. Coordenar com E11 (dono do catálogo): o E11 detalha alavancas; este épico só garante a existência do free e o default "sem assinatura = free, não pessoal".
- **Default de assinatura → free, não pessoal:** revisar `limiteDoPlano` em `avisos/repo.ts` (o `coalesce(..., 'pessoal')` deve virar `'free'`). Toca PROJETO.md/CLAUDE.md se documentado.
- **Evento de login/cadastro negado (H1.2/H1.3):** não usar `eventos_aviso` (é por aviso). Avaliar tabela leve de auditoria de auth (ex.: `eventos_auth` append-only: `tipo` em (`login_negado`,`cadastro_negado`,`login_ok`,`cadastro_ok`), telefone **hash**, `criado_em`), ou registrar via log estruturado sem PII. Decisão de produto: precisamos persistir ou só logar? (ver decisões em aberto).
- **Trilha botão (se escolhida):** tabela `desafios_auth` (token de desafio hash sha256, telefone hash, tipo login/cadastro, status pendente/aprovado/negado, expira_em curto). Necessária porque o clique no WhatsApp precisa "casar" com a aba do navegador que aguarda. **Não** persistir token em claro.
- **H1.4 (conta no aceite):** sem mudança de schema obrigatória (a conta vira `auth.users` via Admin API); opcionalmente coluna `origem` em profiles (`aceite`/`signup`) para métricas. Confirmar com produto.

### Backend api
- **H1.5 — guarda de criação no servidor:** em `avisos/service.ts::criarAviso`, antes do limite numérico, checar se o plano permite criar. Se free → `throw proibido('plano_sem_criacao', 'Seu plano é somente leitura. Escolha um plano para criar combinados.')` (ou `regraNegocio` com 403). Vale para os **dois** fluxos (receber e pagar invertido). Espelhar em E2/E3.
- **H1.4 — criação de conta no aceite:** o `aceite/service.ts` precisa, quando o convidado **não tem sessão**, criar a conta. Como `auth.users` não pode ser inserido por SQL comum (é do schema `auth` do Supabase), a api precisa chamar a **Supabase Admin API** (`auth.admin.createUser` com `phone` confirmado + metadata `nome`) usando a service role key, e então vincular `profile.id` ao aviso. Isolar isso atrás de um especialista `shared/supabase_admin` na api (novo). Idempotente: se já existe usuário com aquele telefone, reusar. **Atenção segurança:** criar conta a partir de telefone não verificado é o mesmo risco do backfill (memória whaviso-pagar-invertido); a conta nasce **free só-leitura** e sem poder de ação, então o risco é contido, mas documentar.
- **Endpoint de pós-aceite (H1.4):** o link "acompanhar no painel" leva à página pública que dispara o login por WhatsApp (H1.2). Garantir que a resposta do `POST /aceite/:token` inclua um sinal de que a conta existe e o número, para a UI montar o convite (sem vazar telefone de terceiros: só ecoa o do próprio aceitante).
- **Trilha OTP (recomendada) — gate "número já cadastrado" (H1.2/H1.3):** o épico exige que a **mensagem de login** só vá a número com cadastro e a de **cadastro** só a número novo. O Supabase `signInWithOtp` não distingue. Opções: (a) endpoint na api `POST /v1/auth/status-telefone` que responde `{ existe: bool }` consultando `profiles.telefone`, e a UI escolhe o copy do passo seguinte; (b) deixar o `hook_otp` no zap variar o **texto** do OTP conforme `profiles.telefone` existir (login vs cadastro). Recomendo (a)+(b): a UI pede o status, e o `hook_otp` ajusta a copy. Rate-limit dedicado no endpoint de status (enumeração de números).
- **Trilha botão (se escolhida):** endpoints `POST /v1/auth/desafio` (cria desafio, enfileira mensagem com botões no outbox do zap) e `GET /v1/auth/desafio/:id` (polling do navegador) ou via Realtime. Ao aprovar pelo botão, a api precisa **emitir um JWT/sessão** — isto exige Admin API (`generateLink`/`signInWithIdToken` não servem para clique) ou um token de sessão próprio. **Alto risco** e contraria a invariante "JWT do Supabase". Só seguir se produto bater o martelo.

### Backend zap
- **Trilha OTP:** ajustar `hook_otp/index.ts` para variar a copy login vs cadastro (consulta `profiles.telefone` ou recebe dica do payload). Manter regra: nunca logar telefone/código. Na Fase 2 a copy vira template (E12), já previsto no MODULE.md.
- **Trilha botão:** novo handling no `webhook_whatsapp` para os payloads `login_aceitar`/`login_negar`/`cadastro_sim`/`cadastro_nao` (precedente: `aceite`/`recusa` já existem em `webhook_whatsapp/repo.ts` e `service.ts`). Idempotência por toque duplo (claim `FOR UPDATE SKIP LOCKED` no desafio). Fallback de canal: se o botão interativo do Baileys falhar, cair para resposta numerada (risco apontado no _CONTEXTO).
- **Outbox de mensagens de auth (trilha botão):** as mensagens de login/cadastro com botões precisam sair pela maquinaria de envio do zap; reusar o padrão de outbox (sem importar módulo). Coalescing não é crítico aqui (volume baixo, 1 desafio por tentativa).

### Frontend
- **H1.2/H1.3 — religar e ajustar a UI:** hoje `WHATSAPP_LOGIN_ATIVO = false` em `Login.tsx`. Religar e adaptar o copy à decisão:
  - Trilha OTP: manter os 2 passos (telefone → código), mas o copy do passo 2 deve refletir o épico (mensagem de login vs cadastro). Distinguir via `POST /v1/auth/status-telefone`.
  - Trilha botão: trocar o passo 2 por uma tela de **espera** ("Confirme no seu WhatsApp tocando em Acessar"), com polling/Realtime do desafio.
- **H1.4 — pós-aceite:** na página de aceite (`frontend/src/modules/aceite`), após confirmar, mostrar CTA discreta "Acompanhar no painel" que leva ao login por WhatsApp (nunca obrigatória).
- **H1.5 — read-only no free:** esconder/desabilitar o botão "Novo aviso" para plano free e exibir CTA de plano; tratar o erro `plano_sem_criacao` da API com banner + link para billing. A regra **é** da API; a UI só melhora a experiência.
- **Limpeza de doc/copy:** revisar `frontend/src/shared/supabase/client.ts` e `schemas.ts` (comentários mencionam "Meta Cloud API" e "número Meta"; hoje é Baileys — atualizar para não confundir; sem travessão).

### Segurança
- JWKS já correto (H1.6). Manter.
- **Enumeração de telefones:** `status-telefone` e o envio de OTP/desafio precisam de rate-limit por IP/telefone e resposta que não revele com certeza a existência de conta além do necessário (a história exige distinguir copy; minimizar o sinal).
- **Criação de conta no aceite (H1.4):** service role key só no backend, nunca exposta; nunca logar telefone/nome completos; conta nasce free só-leitura.
- **Trilha botão:** desafio com expiração curta, token só hash, anti-replay, e emissão de sessão revisada por segurança (é o ponto mais sensível do épico).
- Reafirmar invariantes E13: sem travessão, sem palavras proibidas, copy neutra de gênero em todas as mensagens de login/cadastro.

### Testes
- **H1.5 (crítico):** teste de integração que conta free **não cria** aviso (403 `plano_sem_criacao`) nos dois fluxos; conta com assinatura cria; teste de **corrida** de limite fica no E11 (H11.8) mas o gate de criação free testa aqui.
- **H1.2/H1.3:** unit do gate "número existe?" (login vs cadastro); integração do `hook_otp` variando copy; (trilha botão) teste de idempotência do toque duplo no desafio e do fallback numerado.
- **H1.4:** integração — aceite sem sessão cria conta free e vincula o aviso; reaceite é idempotente (não cria 2ª conta); aceite com sessão usa a conta existente.
- **H1.6/H1.7:** já cobertos por testes de auth existentes em `apps/api`; adicionar caso de 401 e de logout se faltar.
- Garantir que nenhum teste/log imprima telefone/código (grep nos logs).

---

## 4. Sequência de passos

> Cada passo aterrissa num critério HNN.x. Modelo: **sonnet** = mecânico/CRUD/copy/config; **opus** = sessão/segurança/máquina de estados/idempotência.

**Passo 0 — Decidir botão vs OTP (humano).** Bloqueia 1–6 da trilha WhatsApp. *(sem modelo: decisão de produto/segurança, ver seção 7.)*

**Passo 1 — Plano `free` no catálogo + default.** Objetivo: H1.5. Migration **0025** UPSERT do plano `free` (limite 0/só-leitura); ajustar `limiteDoPlano` (`avisos/repo.ts`) para default `free`; rodar `scripts/validate_migrations.sh whaviso_dev` e `supabase db push`. Critério: H1.5 (regra existe no banco). **Modelo: opus** — mexe em billing/limite e no default que afeta todas as contas; erro aqui libera criação indevida.

**Passo 2 — Guarda de criação no servidor (free read-only).** Objetivo: H1.5. Em `avisos/service.ts::criarAviso`, bloquear free com `proibido('plano_sem_criacao', …)` nos dois fluxos; envelope `{error:{code,message}}`. Critério: H1.5 (API barra, não só UI). **Modelo: opus** — guarda de autorização sem janela de corrida, ponto de segurança/produto.

**Passo 3 — UI free read-only + CTA de plano.** Objetivo: H1.5. Esconder "Novo aviso" no free, tratar `plano_sem_criacao` com CTA para billing. Critério: H1.5 (CTA de plano). **Modelo: sonnet** — UI condicional simples, sem lógica de risco.

**Passo 4 — Criação de conta no aceite (H1.4).** Objetivo: H1.4. Especialista `apps/api/src/shared/supabase_admin` (Admin API: criar usuário por telefone+nome, idempotente); `aceite/service.ts` cria conta free quando não há sessão e vincula o aviso. Critério: H1.4 (conta criada por baixo dos panos, entra no free). **Modelo: opus** — idempotência, segurança (telefone não verificado), service role key, vínculo sem roubo de combinado.

**Passo 5 — CTA de pós-aceite com link de acesso (H1.4).** Objetivo: H1.4. UI de aceite mostra "Acompanhar no painel" (opcional); link inicia login por WhatsApp. Critério: H1.4 (link convidando, nunca obrigatório). **Modelo: sonnet** — copy + CTA simples.

**Passo 6 — Login por WhatsApp (trilha escolhida no Passo 0).**
- *Trilha OTP (recomendada):* endpoint `POST /v1/auth/status-telefone` (`{existe}`), `hook_otp` varia copy login vs cadastro, religar `WHATSAPP_LOGIN_ATIVO` e ajustar copy. Critérios: H1.2 (login a número cadastrado), H1.3 (cadastro a número novo). **Modelo: opus** — distinção login/cadastro, enumeração de telefone, gate de existência sem corrida.
- *Trilha botão:* tabela `desafios_auth`, endpoints de desafio+polling, handling de botões no `webhook_whatsapp`, emissão de sessão. Critérios: H1.2/H1.3 (botões Acessar/Negar, Sim/Não). **Modelo: opus** — emissão de sessão, idempotência de clique, fallback de canal, o ponto mais arriscado do épico.

**Passo 7 — Evento de login/cadastro negado.** Objetivo: H1.2 (Negar acesso registrado), H1.3 (Não fui eu registrado). Persistir em auditoria de auth (ou log estruturado sem PII), conforme decisão. **Modelo: sonnet** — gravação append-only simples, uma vez decidido o destino.

**Passo 8 — Limpeza de docs/copy de auth.** Objetivo: invariantes E13 + coerência. Atualizar comentários "Meta/SMS" → Baileys em `client.ts`/`schemas.ts`/CLAUDE.md onde divergir do épico; revisar copy de todas as mensagens (sem travessão, sem palavras proibidas, neutra de gênero). **Modelo: sonnet** — edição de texto/comentário.

**Passo 9 — Testes.** Objetivo: cobrir H1.2–H1.5. Integração free-read-only, criação de conta no aceite idempotente, gate login/cadastro; (trilha botão) idempotência de toque + fallback. **Modelo: opus** — testes de idempotência/segurança/corrida; os de copy/UI podem ser sonnet.

**Passo 10 — Atualizar o grafo.** `graphify update .` após as mudanças. **Modelo: sonnet** — mecânico.

---

## 5. Dependências de outros épicos

- **E11 (Planos):** dono do catálogo de planos. O plano `free` (Passo 1) deve ser combinado com E11 para não duplicar/conflitar a migration do catálogo. Idealmente E11 cria o catálogo (4 planos incl. free) e E1 só consome; se E1 for implementado antes, E1 cria o free e E11 herda.
- **E13 (Linguagem):** invariantes (sem travessão/palavras proibidas, copy neutra) valem em toda mensagem de login/cadastro/aceite.
- **E12 (Templates):** na Fase 2 as copies de OTP/botões de auth viram templates editáveis no admin (já previsto no `hook_otp/MODULE.md`); no MVP ficam fixas no código.
- **E5 (Convite & Aceite):** H1.4 depende do fluxo de aceite (E5 é o dono do aceite pelo WhatsApp/página). A criação de conta no aceite encaixa no `aceite/service.ts`, que E5 também toca; coordenar para não conflitar.
- Independentes: H1.1, H1.6, H1.7 (já prontos).

---

## 6. Riscos e pontos de teste dedicado

- **Free read-only (H1.5) — risco de regressão de receita/produto:** se o default continuar `pessoal`, contas novas criam de graça. Teste dedicado: conta sem assinatura → 403 ao criar (dois fluxos). **Crítico.**
- **Criação de conta no aceite (H1.4):** telefone **não verificado** → risco de criar conta/puxar combinado de número alheio (mesma classe do backfill, memória whaviso-pagar-invertido). Mitigado por nascer free só-leitura. Teste: idempotência (reaceite não duplica conta), e que a conta criada não consegue agir além de visualizar.
- **Trilha botão — emissão de sessão:** contraria "JWT do Supabase"; é o maior risco arquitetural. Se escolhida, exige revisão de segurança dedicada (anti-replay, expiração, token só hash).
- **Canal Baileys (botões interativos):** instabilidade → prever **fallback numerado** (resposta "1 = Acessar / 2 = Negar"). Teste do fallback.
- **Enumeração de telefones:** `status-telefone`/envio de OTP precisa de rate-limit; teste que abuso não revela base de números.
- **Idempotência de toque duplo** (trilha botão): claim `SKIP LOCKED` no desafio; teste de dois cliques simultâneos.
- **Sem PII em log:** teste/grep garantindo que telefone/código nunca aparecem em log.

---

## 7. Decisões em aberto (confirmar com o humano, não inventar)

1. **Login WhatsApp: botão vs OTP por código** (a decisão central do épico). H1.2/H1.3 descrevem **botões** (*Acessar/Negar*, *Sim sou eu/Não fui eu*); o código atual e a doc de auth usam **OTP de 6 dígitos** (Supabase emite o JWT). Botão tem UX melhor mas o Supabase **não emite sessão de um clique** → exigiria a gente emitir/gerenciar JWT (contraria a invariante "JWT continua sendo do Supabase") ou um adaptador. **Recomendação do plano: OTP** (menor risco, transporte já pronto). Decidir antes dos Passos 6/7.
2. **Onde registrar o "negado" (H1.2/H1.3):** tabela de auditoria de auth nova (`eventos_auth`, telefone hash) **ou** só log estruturado sem PII? `eventos_aviso` não serve (é por aviso).
3. **Plano free: limite 0 vs flag `somente_leitura`** no catálogo, e quem cria a migration (E1 ou E11). Decisão de modelagem a alinhar com E11.
4. **Conta no aceite (H1.4): criar sempre, ou só quando o convidado tocar a CTA "acompanhar no painel"?** O épico diz "cria por baixo dos panos … se o número recusar/ignorar, nada fica pendente". Confirmar se a conta nasce no aceite (mesmo sem o convidado pedir) ou só no 1º uso do link, e se grava coluna `origem`.
5. **Status-telefone e privacidade:** o quanto a UI pode revelar sobre existência de conta (a história exige copy diferente login vs cadastro, o que já é um sinal). Confirmar com segurança/produto.
