# Relatório de validação: Épico 01 — Conta & Autenticação

> Revisão adversarial do plano `01-conta-autenticacao.plano.md` contra a fonte da verdade `historias/01-conta-autenticacao.md` e `_CONTEXTO.md`. Estado do código conferido em 2026-06-22 por leitura direta (graphify CLI indisponível; GRAPH_REPORT + arquivos crus).

## 1. Veredito

**Aprovado com ressalvas.**

O plano é sólido, honesto sobre as divergências (botão vs OTP), e cobre os 7 critérios-pai. As afirmações sobre o código foram verificadas e estão **corretas** (`limiteDoPlano` com `coalesce(..., 'pessoal')` em `avisos/repo.ts:132`; `criarAviso` em `avisos/service.ts:21-37`; `hook_otp` manda OTP de texto, não botões; `WHATSAPP_LOGIN_ATIVO = false` em `Login.tsx:22`; `aceite/service.ts` só vincula `uid` quando há sessão, não cria conta; catálogo com 3 planos em `0019`, sem `free`). As ressalvas são gaps de detalhe que, se ignorados, viram bug ou furo de critério, não falhas estruturais.

## 2. Gaps por severidade

### Críticos

- **[C1] H1.4 — "se recusar/ignorar, nada fica pendente de ação obrigatória" colide com "criar conta sempre".** O plano (Passo 4 + decisão em aberto #4) propõe criar a conta `auth.users` **no aceite**, mas o critério final da H1.4 exige que, se o número recusar/ignorar, **nenhuma conta ativa fique pendente**. Se a conta é criada no momento do aceite (que é justamente o "aceitar"), o caso "ignorar" nem chega a criar conta (não houve aceite) — ok. Mas o plano não deixa explícito que a criação **só** ocorre no caminho de aceite efetivo, nunca no convite enviado/ignorado. Correção: o plano deve afirmar que conta-no-aceite dispara **exclusivamente** dentro de `aceitar()` (já é onde o Passo 4 a coloca), e que recusa (`webhook_whatsapp` → `cancelado`) **não** cria conta. Sem essa frase, a decisão #4 ("criar sempre vs só na CTA") fica ambígua quanto ao critério.

- **[C2] H1.5 — colisão entre `limite=0` e o erro errado.** O plano (Passo 1) sugere `max_avisos_ativos = 0` para o free. Mas com `limite=0`, o **bloco existente** de `criarAviso` (`avisos/service.ts:29-36`) já dispara `regraNegocio('limite_plano_atingido', 'Seu plano permite até 0 avisos ativos…')` — mensagem absurda e código errado, **antes** do guard novo do Passo 2, a menos que o guard `plano_sem_criacao` seja inserido **estritamente antes** da consulta de limite. O plano diz "antes do limite numérico", o que está correto, mas precisa ser uma instrução firme: o guard de free roda antes de `limiteDoPlano`/`contarAtivos`, e nunca cai no `limite_plano_atingido`. Alternativa mais limpa: usar uma **flag `somente_leitura`** no plano (já listada como decisão #3) em vez de `limite 0`, evitando que o número 0 vaze pela porta errada. Recomendação: preferir a flag, não o limite 0.

### Médios

- **[M1] H1.4 — Admin API: o plano ignora o precedente já existente no repo.** O Passo 4 propõe um especialista novo `shared/supabase_admin` "do zero", mas existe `backend/scripts/criar_usuario_confirmado.ts` que já chama `POST {SUPABASE_URL}/auth/v1/admin/users` com a service role key e trata o 422 (já existe → idempotente). O plano deveria citar esse arquivo como base/precedente (reduz risco e tempo) e reaproveitar o tratamento de "já existe". Além disso, esse script cria por **e-mail/senha**; a H1.4 exige criar por **telefone confirmado** (`phone` + `phone_confirm: true`) — o plano menciona `phone` confirmado, mas convém destacar que o trigger `handle_new_user` (`0002_profiles.sql`) cria o profile com **nome vazio**, então a passagem do `nome` (via metadata + backfill no profile) precisa de um passo explícito, senão o nome do convidado se perde.

- **[M2] H1.4 — idempotência do "número já existe" não está conectada à corrida real.** O plano fala em "se já existe usuário com aquele telefone, reusar", mas não especifica **como** descobrir isso sem corrida (dois aceites simultâneos do mesmo número criando duas contas). A Admin API do GoTrue retorna 422 em telefone duplicado (como o script faz com e-mail), mas o plano não amarra essa garantia. Correção: o teste de idempotência do Passo 9 deve cobrir **dois aceites concorrentes** do mesmo telefone (não só reaceite sequencial), e o passo deve declarar que a unicidade é garantida pelo Auth (telefone único) + tratamento de 422, não por SELECT-then-INSERT.

- **[M3] H1.2/H1.3 — gate "número já cadastrado" não fecha o furo do `signInWithOtp`.** O plano reconhece que `signInWithOtp` emite a qualquer número e propõe `POST /v1/auth/status-telefone` + variar a copy no `hook_otp`. Mas o critério H1.2 ("essa mensagem de login só vai a número que já tem cadastro") e H1.3 ("informo número que ainda não tem cadastro") são sobre **qual mensagem** chega, não sobre bloquear o envio. O plano cobre a copy, porém **não** trata o `shouldCreateUser` do `signInWithOtp`: se ele continuar criando usuário no Supabase para número novo **antes** do clique de confirmação, a H1.3 ("conta criada só ao tocar Sim, sou eu") é violada na trilha OTP (a conta nasce no envio do código, não na confirmação). Correção: o plano deve declarar a semântica de `shouldCreateUser` na trilha OTP e o que conta como "conta criada" (o critério H1.3 amarra criação ao ato de confirmar). Isto também reforça por que a decisão botão-vs-OTP não é só UX: a trilha OTP tem um desencaixe semântico com H1.3.

- **[M4] H1.6 / H1.7 — critérios marcados `[x]` sem passo de teste de regressão garantido.** O plano diz "já cobertos por testes existentes; adicionar 401 e logout se faltar". "Se faltar" é frouxo. O Passo 9 deve **confirmar** a existência de teste de 401 (token inválido/expirado → envelope) e de logout, e criá-los se ausentes — não condicionar. H1.6 é segurança (JWKS) e merece teste explícito mesmo estando pronto.

- **[M5] Evento de "negado" (H1.2/H1.3) — risco de logar PII.** O Passo 7 e a decisão #2 propõem `eventos_auth` com telefone **hash**. Correto, mas o plano não amarra que o **valor em claro do telefone nunca** entra em log nem na tabela (só sha256), alinhado à invariante E13 e ao padrão `hook_otp` (que já loga só o motivo). Deixar explícito: append-only, sem DELETE (invariante "sem DELETE de auditoria"), telefone só hash.

### Baixos

- **[B1] Numeração de migration.** O plano assume a próxima migration livre = **0025**, mas o repo já tem até `0024_ciclo_unificado.sql`. Como E1 é uma das fundações e vários planos-irmãos (E11 etc.) também querem migrations novas, há risco de **colisão de número 0025** entre épicos. Correção: o plano deve marcar o número como "próximo livre no momento da implementação" e coordenar com E11 (que é o dono do catálogo de planos — ver dependência abaixo).

- **[B2] Limpeza de copy (Passo 8) não lista a string concreta a corrigir.** O `textoOtp` em `hook_otp/index.ts:11-12` ("Seu código de acesso…") está sem travessão e neutro — ok. Mas o plano deveria nomear que essa é a única copy de auth ativa no MVP e que, na trilha botão, novas copies de botão precisam passar pelo mesmo crivo E13. Sem isso, o Passo 8 fica vago.

- **[B3] H1.5 — leitura "como devedor ou cobrador" no free não tem passo próprio.** O critério "no free, consigo ver os combinados em que estou envolvido (devedor ou cobrador)" é dado como já-OK via `listarAvisos` (filtro `cobrador_id=$1 or devedor_profile_id=$1`), mas o plano não tem um teste confirmando que o free **lê** (só bloqueia criar). Adicionar ao Passo 9 um caso: conta free lista seus avisos com sucesso (200), só falha ao criar (403).

## 3. Cobertura dos critérios de aceite

Todos os 7 critérios-pai (H1.1–H1.7) têm passo no plano. Sub-critérios sem passo claro:

- **H1.3 "Ao tocar Sim, sou eu, a conta é criada"** — na trilha OTP recomendada, "criar conta só na confirmação" não está garantido (ver M3). Marcar como critério sob risco na trilha recomendada.
- **H1.4 "Ao usar esse link pela primeira vez, recebo a confirmação de acesso pelo WhatsApp (login H1.2)"** — depende de H1.2 reescrito; o plano reconhece, mas o Passo 5 (CTA pós-aceite) não amarra o teste de "1º uso do link dispara login", fica implícito.
- Demais sub-critérios estão cobertos.

## 4. Testes

Pontos críticos do epico **cobertos** pelo plano (Passo 9 / seção 6): free não cria (403, dois fluxos), idempotência da conta-no-aceite, enumeração de telefone, sem PII em log, fallback numerado (trilha botão), idempotência de toque duplo (trilha botão).

**Lacunas de teste:**
- Corrida real na criação de conta no aceite (dois aceites concorrentes do mesmo telefone) — ver M2.
- Free **lê** com sucesso (não só "não cria") — ver B3.
- 401 e logout confirmados, não condicionais — ver M4.
- Ordem do guard `plano_sem_criacao` antes do `limite_plano_atingido` (teste que o free recebe o código/ mensagem certos, não "limite 0") — ver C2.

## 5. Coerência cross-épico

- **E11 (Planos) — dono do catálogo.** O plano reconhece (dependência + decisão #3) que E11 é dono do catálogo e que o `free` pode ser criado por E1 ou herdado de E11. **Coerente, com ressalva B1** (numeração de migration a coordenar). Não há contradição: ambos usam UPSERT idempotente no padrão `0019`.
- **E5 (Convite & Aceite) — dono do `aceite/service.ts`.** O plano coordena corretamente (H1.4 encaixa em `aceitar()`, E5 também toca). Sem contradição. Atenção: `aceite/service.ts` usa o estado `pendente`, que `_CONTEXTO.md` renomeia para `programado` (varredura cross-épico). O plano de E1 **não** menciona essa renomeação — é tema de E2/E5/E6, não de E1, então não é gap de E1, mas o Passo 4 (que edita `aceitar()`) deve evitar reintroduzir o literal `pendente` se a varredura já tiver passado. Anotar como dependência de ordem.
- **E12 (Templates):** coerente — copies de auth viram template na Fase 2, fixas no código no MVP, conforme `hook_otp/MODULE.md`.
- **E13 (Linguagem):** invariantes referenciadas. Coerente.
- Sem contradição detectada com os demais planos-irmãos presentes (`03`, `04`, `05`, `06`, `07`, `08`, `09`, `10`).

## 6. Aderência às invariantes do Épico 13

- **Sem travessão / palavras proibidas:** o plano não usa travessão; copies propostas ("Seu plano é somente leitura…", "Acompanhar no painel") estão limpas e sem dívida/atraso/cobrança. OK. Reforçar no Passo 8 que copies de botão (trilha botão) passam pelo mesmo crivo.
- **Gênero neutro:** copies de login/cadastro/aceite são neutras. OK.
- **Centavos / fuso / servidor:** não aplicável diretamente a auth, mas o plano não viola (limite é int; agendamentos seguem no servidor via `aceite/service.ts`). OK.
- **Tokens só hash / nunca logar PII:** o plano exige hash do telefone em `eventos_auth` e service role só no backend; consistente com `hook_otp` (loga só `motivo`). Reforçar M5.
- **Sem DELETE de negócio/auditoria:** `eventos_auth` deve nascer append-only (M5). O plano não diz isso explicitamente — adicionar.

## 7. Recomendação de modelo por passo

Sensata no geral. **opus** para Passos 1, 2, 4, 6, 9 (billing/limite, guard de autorização, criação de conta + idempotência + service role, sessão/gate de existência, testes de segurança/corrida) e **sonnet** para 3, 5, 7, 8, 10 (UI condicional, CTA/copy, gravação append-only, limpeza de texto, grafo). Ressalva: **Passo 7** (evento negado) é marcado sonnet "uma vez decidido o destino" — razoável, mas se a decisão for `eventos_auth` com hash + trigger de transição, sobe para opus; o plano deveria condicionar o modelo à decisão #2.
