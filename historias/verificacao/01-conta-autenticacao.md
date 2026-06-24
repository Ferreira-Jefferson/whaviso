# Verificação — Épico 01: Conta & Autenticação

## Veredito (15 [x] · 6 [~] · 4 [!] · 3 [+])

Resumo: a infraestrutura de auth está sólida (JWKS local, conta nasce free, free só-leitura barrado na API, conta-no-aceite por telefone, sessão persistente, sair). A divergência central é a mesma que a própria história já anuncia nas "Decisões em aberto": o login/cadastro por WhatsApp foi implementado por **OTP de código de 6 dígitos**, enquanto as histórias H1.2 e H1.3 pedem **aprovação por botão** (Acessar/Negar, Sim sou eu/Não fui eu). Disso decorrem vários critérios marcados [!]/[+] (mensagens, botões, registro do evento de recusa). Além disso, o link de "acompanhar no painel" do aceite (H1.4) não é enviado.

---

## Por história

### H1.1: Entrar com Google 🟢

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Botão "Entrar com Google" inicia OAuth do Supabase | [x] | `frontend/src/modules/auth/components/GoogleLoginButton.tsx:114-126` (GIS + `signInWithGoogleIdToken`); `frontend/src/shared/supabase/client.ts:42` (`signInWithIdToken`) | Não coberto (sem teste de front) |
| 1º login cria o perfil automaticamente (cadastro fundido) | [x] | `backend/supabase/migrations/0002_profiles.sql:32-48` (trigger `handle_new_user`); `0026_planos_balde_unico.sql:127-141` (estende p/ criar assinatura free) | `backend/apps/api/src/modules/auth/tests/auth.test.ts:109` (usuário "nasce free") |
| Ao voltar do OAuth a sessão fica ativa e o painel carrega | [x] | `GoogleLoginButton.tsx:124` (`navigate(next ?? '/app')`); `frontend/src/shared/auth/AuthProvider.tsx:57-69` (resolve sessão no mount/onAuthStateChange) | Não coberto |
| Nenhuma tela de senha em momento algum | [x] | `frontend/src/modules/auth/pages/Login.tsx` (só Google + WhatsApp); fora de escopo confirma a remoção | Não coberto |

### H1.2: Entrar pelo WhatsApp (usuário já cadastrado) 🟢

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Informo o telefone na tela de login | [x] | `Login.tsx:151-176` (form de telefone) | Não coberto |
| Recebo mensagem de confirmação "Tentativa de login com seu número" com botões **Acessar** e **Negar acesso** | [!] | `backend/apps/zap/src/modules/hook_otp/index.ts:15-16` (`textoOtpLogin`): entrega um **código de 6 dígitos**, sem botões Acessar/Negar. Diverge da história (aprovação por botão) | `backend/apps/zap/src/modules/hook_otp/tests/hook_otp.test.ts` (cobre entrega de OTP) |
| Ao tocar **Acessar**, a sessão é criada e o painel carrega | [!] | Não há botão "Acessar"; a sessão nasce ao **digitar o código** (`Login.tsx:62-71`, `verifyOtp` em `frontend/src/shared/supabase/client.ts:55`) | Não coberto |
| Ao tocar **Negar acesso**, o login é recusado e o evento registrado | [+] | Não existe botão "Negar acesso" nem registro de `login_negado`. O tipo está declarado em `backend/apps/api/src/shared/eventos_auth/index.ts:17` mas **nunca é inserido** por código não-teste (único insert é `status_consultado`, `auth/index.ts:34`) | Não coberto |
| Mensagem de login só vai para número que **já tem cadastro** | [x] | `hook_otp/index.ts:54-67` (consulta `profiles`; existe → `textoOtpLogin`, novo → `textoOtpCadastro`); `auth/index.ts:19-39` (`/auth/status-telefone` para a UI escolher a copy) | `auth.test.ts:33-55` (existe true/false); `hook_otp.test.ts` (copy login vs cadastro) |

### H1.3: Cadastro pelo WhatsApp (número novo) 🟢

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Informo um número que ainda não tem cadastro | [x] | `Login.tsx:44-60` + `auth/index.ts:19-39` (status do telefone) | `auth.test.ts:45-55` |
| Recebo "Olá, eu sou o Whaviso, identificamos uma tentativa de cadastro..." com botões **Sim, sou eu** e **Não fui eu** | [!] | `hook_otp/index.ts:18-19` (`textoOtpCadastro`): texto bate o tom mas entrega **código**, sem botões Sim sou eu/Não fui eu. Diverge | `hook_otp.test.ts` |
| Ao tocar **Sim, sou eu**, a conta é criada e já acesso | [!] | Sem botão; a conta nasce ao **digitar o código** (`verifyOtp` → trigger `handle_new_user`) | Não coberto |
| Ao tocar **Não fui eu**, o cadastro é abortado e o evento registrado | [+] | Sem botão "Não fui eu"; `cadastro_negado` declarado (`eventos_auth/index.ts:18`) mas **nunca inserido** | Não coberto |
| Nos acessos seguintes, esse número recebe a mensagem **de login** (H1.2), não a de cadastro | [x] | `hook_otp/index.ts:57-67` (decide login vs cadastro por existência em `profiles`) | `hook_otp.test.ts` (copy varia por cadastro) |

### H1.4: Conta criada automaticamente no aceite 🟢

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Ao aceitar (Épico 5), cria a conta por baixo dos panos com número e nome | [x] | `backend/apps/zap/src/modules/webhook_whatsapp/service.ts:131-133,204-217` (`garantirContaNoAceite`); `backend/apps/zap/src/shared/supabase_admin/index.ts:69-92` (`garantirContaPorTelefone`, `phone_confirm:true`, nome no metadata) | `backend/apps/zap/src/modules/webhook_whatsapp/tests/convite_aceite.test.ts:284-297` (cria conta FREE + vincula profile) |
| Junto da confirmação do aceite, recebo um link convidando a acompanhar no painel | [+] | A resposta do aceite é `resposta.aceite` (`webhook_whatsapp/repo.ts:587`), cujo texto é só "Combinado confirmado! Vamos te enviar os lembretes acordados." (`0022_templates_unificada.sql:72-74`): **não há link de painel**. Nenhuma menção a APP_URL/painel no zap | Não coberto |
| Ao usar o link pela 1ª vez, recebo confirmação de acesso pelo WhatsApp (login da H1.2, conta já existe) | [~] | O reconhecimento "conta já existe → copy de login" está em `hook_otp/index.ts:57-67`. Mas o **link** que dispararia esse fluxo não é enviado (critério anterior), então a jornada não fecha ponta a ponta | Não coberto |
| A conta criada entra no **plano free** (só visualização, H1.5) | [x] | `0026_planos_balde_unico.sql:127-141` (trigger cria assinatura `free`); `supabase_admin/index.ts:8-11` (comentário: handle_new_user cria profile + assinatura FREE) | `convite_aceite.test.ts:284` (conta FREE) |
| Se o número recusar/ignorar, nenhuma conta ativa fica pendente de ação obrigatória | [x] | Conta só é criada no ramo `acao === 'aceite'` (`service.ts:131`); recusa vai a `recusado` sem criar conta (`repo.ts:543`) | `convite_aceite.test.ts:245` (recusa) |

### H1.5: Plano free com acesso só de leitura 🟢

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| No free, consigo **ver** os combinados (devedor ou cobrador) | [x] | `GET /v1/avisos` é só `app.autenticar`, sem guarda de plano (`backend/apps/api/src/modules/avisos/index.ts`); free lê 200 | `auth.test.ts:124-130` (free lê lista) |
| No free, **não** consigo **criar**; ação leva a CTA de plano | [~] | API barra (abaixo). A CTA é da UI; não verifiquei o componente de CTA aqui, mas o erro `plano_somente_leitura` carrega a mensagem "Escolha um plano para ativar os envios" (`backend/apps/api/src/shared/planos/index.ts:140-144`) | Backend coberto; CTA de UI não verificada |
| Regra aplicada na **API** (não só UI); criar sem plano retorna `{ error: { code, message } }` | [x] | `planos/index.ts:134-144` (`exigirVagaDeAgenda` lança `plano_somente_leitura`); `avisos/service.ts:131` aplica na criação | `auth.test.ts:132-164` (receber e pagar → 422 `plano_somente_leitura`); `avisos/tests/avisos.test.ts:94-102` |
| Detalhamento de limites e planos no Épico 11 | [x] | Remetido ao E11 pela história | n/a |

### H1.6: Sessão validada localmente na API 🟢

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| Toda rota protegida exige `Authorization: Bearer <jwt>` e valida via JWKS | [x] | `backend/apps/api/src/shared/auth/index.ts:42-62` (`createRemoteJWKSet` + `jwtVerify` por issuer); `preHandler: app.autenticar` nas rotas protegidas (ex.: `perfil/index.ts:52`) | `auth.test.ts:116-122` (sem token → 401) |
| Token inválido/expirado → envelope `{ error: { code, message } }` com 401 | [x] | `auth/index.ts:49,54` (`naoAutorizado`); `auth.test.ts:121` confirma `error.code === 'nao_autorizado'` | `auth.test.ts:116-122` |
| Rotas públicas (ex.: webhook WhatsApp) não exigem JWT e usam mecanismo próprio | [x] | `/auth/status-telefone` público com rate-limit (`auth/index.ts:17-23`); `/hooks/sms` valida assinatura Standard Webhooks (`hook_otp/index.ts:36-45`); webhook do zap por HMAC | `auth.test.ts:33-55`; `hook_otp.test.ts` |

### H1.7: Manter sessão e sair 🟢

| Critério | Status | Evidência (arquivo:linha) | Teste |
|---|---|---|---|
| A sessão persiste ao recarregar a SPA | [x] | `frontend/src/shared/supabase/client.ts:26` (`persistSession: true`); `AuthProvider.tsx:57-69` (resolve via `getSession` no mount) | Não coberto |
| Existe ação "sair" que encerra a sessão e redireciona ao login | [x] | `frontend/src/app/layouts/AppShell.tsx:41-43` (`sair()` → `signOut()` → `navigate('/entrar')`); `AuthProvider.tsx:86-88` (`signOut`) | Não coberto |

---

## O que o código precisa mudar para seguir a história (acionável, priorizado; mudanças de CÓDIGO)

> Atenção: a própria história, em "Decisões em aberto" (linha 80), reconhece que doc/plano de auth previam OTP por código e que o fluxo por botão tem outra implementação ("o Supabase não emite sessão a partir de um clique"). Ela NÃO marca isso como fora de escopo nem como gated; manda "decidir antes de implementar; na validação vai aparecer como divergência". Logo, abaixo está listado como divergência de código a corrigir, não como item futuro.

1. **Login/cadastro por WhatsApp via botão, não por código (H1.2, H1.3).** O código entrega um OTP de 6 dígitos (`hook_otp/index.ts:15-19`, `Login.tsx:62-72`, `verifyOtp`). A história pede aprovação por botão: *Acessar / Negar acesso* (login) e *Sim, sou eu / Não fui eu* (cadastro), sem digitar código. Como o Supabase não emite sessão a partir de um clique (nota da própria história), seguir a história exige um adaptador que: envie a mensagem com botões pelo zap (Baileys), capture o clique no `webhook_whatsapp`, e emita/gerencie a sessão (JWT) para a SPA. É a maior mudança do épico.

2. **Registrar o evento de recusa de login e de cadastro (H1.2, H1.3).** Os tipos `login_negado` e `cadastro_negado` existem em `eventos_auth/index.ts:17-18` mas **nunca são inseridos**. Ao implementar os botões "Negar acesso"/"Não fui eu", chamar `registrarEventoAuth(..., 'login_negado'|'cadastro_negado', ...)` no ramo de recusa.

3. **Enviar o link de "acompanhar no painel" junto da confirmação do aceite (H1.4, critério 2).** Hoje `resposta.aceite` (`0022_templates_unificada.sql:72-74`) não tem link. Acrescentar o link de painel ao texto entregue no aceite (template e/ou variável com a URL do app), para que o convidado consiga acessar pela 1ª vez (e cair no fluxo de login da H1.2). Sem isso, o critério 3 da H1.4 também fica pela metade.

4. **(Decorrente de 1) Mensagens de login/cadastro com a copy exata da história.** As frases pedidas são *"Tentativa de login com seu número"* (H1.2) e *"Olá, eu sou o Whaviso, identificamos uma tentativa de cadastro com seu número"* (H1.3). O texto de cadastro já está próximo (`hook_otp/index.ts:18`); ao trocar para botões, ajustar a copy e remover a parte do "código".

5. **(Opcional, decorrente de 1) Registrar `login_ok`/`cadastro_ok`/`otp_solicitado`/`otp_entregue`/`conta_criada_no_aceite`.** Estão declarados (`eventos_auth/index.ts:14-21`, `0027_eventos_auth.sql:25-32`) e nenhum é inserido em código não-teste. A história não exige explicitamente esses (só "o evento registrado" da recusa), mas o `conta_criada_no_aceite` reforçaria a auditoria de H1.4. Tratar como melhoria, não bloqueio.

---

## Itens que a própria história marca como 🟡/fora de escopo (com a linha da história)

- Nenhum critério deste épico tem legenda 🟡; todas as histórias H1.1 a H1.7 estão marcadas 🟢 (linhas 9, 19, 30, 41, 52, 62, 71).
- A migração para a Meta oficial é fora de escopo, mas só como **troca de transporte**, sem alterar o comportamento das histórias: "Migração para Meta oficial: é troca de transporte futura, o comportamento das histórias acima não muda." (linha 85). Ou seja, NÃO justifica deixar de implementar botão de login/aceite por causa de dependência da Meta: o canal já é Baileys (linha 4).
- Fora de escopo expresso: e-mail/senha (linha 83) e páginas de recuperação/troca de senha (linha 84). O código respeita: não há telas de senha (`Login.tsx`).

---

## Observações

- **JWKS e segurança da API estão bem cobertos**: validação local por issuer/JWKS, `autenticar`/`autenticarOpcional`/`requireRole`, bloqueio de conta suspensa, e auditoria sem PII (só hash do telefone). Boa aderência ao H1.6.
- **Free só-leitura é defendido em profundidade**: a regra está no SQL (`alavancas_do_plano`, `somente_leitura=true` para free em `0026`) e na API (`exigirVagaDeAgenda`/`exigirVagaDeAtivo`), com testes para receber e pagar invertido (`auth.test.ts:132-164`).
- **Conta-no-aceite (H1.4) é robusta**: idempotente por telefone único do GoTrue (sem select-then-insert), best-effort que não desfaz o aceite, vínculo por `profile.id`. Falta só o link de painel.
- **`/auth/status-telefone`** revela só "existe sim/não" com rate-limit de 12/min contra enumeração, e audita apenas o hash. Coerente com a regra de não logar telefone.
- O par de helpers Admin Supabase é duplicado de propósito entre api e zap (cada app self-contained, módulo não importa módulo). Não é divergência da história.
