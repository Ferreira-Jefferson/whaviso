# Runbook: migrar o WhatsApp do Baileys para a Meta Cloud API

> Por que: o Baileys é não-oficial. O caso de uso do whaviso (mandar lembrete pra
> muitos devedores novos, "cold outreach") é exatamente o que o anti-spam do WhatsApp
> pune, vira `ack 463` / reachout timelock / ban. A Meta Cloud API é o modelo oficial
> e sancionado pra mensagem de negócio em escala (templates aprovados + opt-in).
> Contexto técnico do bloqueio: memória `whaviso-baileys-lid-463`.

> Como usar: rode **um passo por vez**, confirmando antes de seguir. Os passos marcados
> **[META]** são no painel da Meta (manual, browser); os **[COD]** são no repositório;
> os **[VPS]** são no servidor.

O provider já está **isolado atrás da interface `ClienteWhats`**
(`backend/apps/zap/src/shared/baileys_client/tipos.ts`): `conectar`, `parar`,
`desconectar`, `enviarMensagem`, `enviarTexto`, `onBotao`, `onTexto`, `status`. A troca
é **contida no zap**: implementar um provider Meta atrás dessa mesma interface. A `api`,
o front, a fila/outbox (`envios`, `notificacoes_*`), o scheduler e a máquina de estados
**não mudam**. O inbound, que hoje vem pelo socket, passa a vir por **webhook HTTP**.

---

## Fase 0 — Ambiente de TESTE da Meta (sem verificação de empresa, hoje)

Objetivo: poder testar o fluxo COMPLETO (envio + botões + respostas) já, de graça, com
até 5 destinatários de teste. Não precisa de empresa verificada nesta fase.

1. **[META]** Entre em https://developers.facebook.com → **My Apps** → **Create App** →
   tipo **Business**. Dê um nome (ex.: "Whaviso").
2. **[META]** No app, **Add Product** → **WhatsApp** → **Set up**. Isso cria/associa uma
   **WhatsApp Business Account (WABA)** de teste e provisiona um **número de teste** da
   própria Meta (você não usa seu chip nesta fase).
3. **[META]** Na tela "API Setup" anote:
   - **Phone number ID** (do número de teste) → vai em `META_PHONE_NUMBER_ID`.
   - **WhatsApp Business Account ID** → `META_WABA_ID`.
   - **Temporary access token** (validade 24h) → `META_TOKEN` (provisório; Fase 5 troca
     por token permanente).
4. **[META]** Em "API Setup" → **To**: adicione até **5 números destinatários de teste**
   (o seu celular e o de quem for testar). Cada um recebe um código de confirmação no
   WhatsApp; confirme. Só esses números recebem mensagem na fase de teste.
5. **[META]** Teste fora do código: na própria tela, mande o template `hello_world` pra
   um destinatário de teste e veja chegar. Confirma que o número/token funcionam.

> Janela de 24h: depois que o destinatário **te responde**, você pode mandar texto livre
> por 24h (mensagem de "sessão"). Para **iniciar** conversa (cold), só com **template
> aprovado** (ver Fase 3). O `hello_world` já vem aprovado pra testar o início.

---

## Fase 1 — Webhook de inbound no zap (recebe respostas/botões/status)

A Meta entrega tudo (mensagens recebidas, cliques de botão, status de entrega) por
**POST HTTP** num webhook seu, não pelo socket. Precisa de uma URL pública HTTPS.

1. **[COD]** Adicionar ao `backend/apps/zap/src/env.ts` as vars (já existem no
   `production.env`): `META_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`,
   `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_GRAPH_URL` (default
   `https://graph.facebook.com`), `META_API_VERSION` (ex.: `v23.0`). Todas opcionais por
   enquanto (coexistem com `WHATS_*` durante a transição).
2. **[COD]** Criar a rota de webhook no zap (registrar em `app.ts`):
   - `GET /webhook/whatsapp`: verificação do handshake. Compara
     `hub.verify_token` com `META_VERIFY_TOKEN` e ecoa `hub.challenge`.
   - `POST /webhook/whatsapp`: recebe os eventos. **Valida a assinatura**
     `X-Hub-Signature-256` (HMAC SHA-256 do corpo cru com `META_APP_SECRET`, mesmo
     padrão do `rawBody` que já existe pro Send SMS Hook em `app.ts`).
3. **[COD]** Mapear o payload da Meta para os eventos internos e **reusar a lógica que já
   existe** em `backend/apps/zap/src/modules/webhook_whatsapp/service.ts`:
   - mensagem `type: "button"`/`interactive.button_reply` → monta `EventoBotao`
     (`{ wamid, telefone, buttonId }`) → `processarBotao`.
   - mensagem `type: "text"` → monta `EventoTexto` (`{ wamid, telefone, texto }`) →
     `processarTexto`.
   - `statuses[]` (sent/delivered/read/failed) → atualizar `envios.entrega_status` pelo
     `wamid` (hoje o Baileys não dá isso; com a Meta passa a dar).
   - Responder **200 rápido** sempre (a Meta re-tenta se não receber 200); processar em
     background, como o `hook_otp` já faz.
4. **[META]** Em **WhatsApp → Configuration → Webhook**: **Callback URL** =
   `https://<host-publico-do-zap>/webhook/whatsapp`, **Verify token** = o mesmo
   `META_VERIFY_TOKEN`. Após verificar, **Subscribe** ao campo **messages**.

> URL pública do zap: hoje o zap escuta em `:3002` atrás do nginx/Cloudflare. Exponha um
> caminho HTTPS público só pro webhook (ex.: `https://api.whaviso.com/webhook/whatsapp`
> roteando pro zap, ou um subdomínio). O endpoint é protegido pela assinatura, não por
> auth de usuário.

---

## Fase 2 — Provider Meta de ENVIO (atrás da interface ClienteWhats)

1. **[COD]** Criar `backend/apps/zap/src/shared/meta_client/` implementando `ClienteWhats`:
   - `enviarTexto(para, texto)` → `POST {GRAPH_URL}/{API_VERSION}/{PHONE_NUMBER_ID}/messages`
     com `{ messaging_product: "whatsapp", to, type: "text", text: { body } }` e header
     `Authorization: Bearer {META_TOKEN}`. Retorna `{ wamid }` (de `messages[0].id`).
   - `enviarMensagem(m)` → traduz `MensagemWhats` (texto + botões + mídia) para o formato
     Meta: botões viram `type: "interactive"` (`action.buttons[].reply.{id,title}`);
     mídia vira `type: image|video|document|audio` com `link`.
   - `conectar`/`parar`/`desconectar`/`status`: viram no-ops/health (a Meta não tem
     socket nem QR; "conectado" = token+phone_id válidos, dá pra checar com um GET ao
     `/{PHONE_NUMBER_ID}`). `onBotao`/`onTexto`: registram os handlers que o **webhook**
     (Fase 1) vai chamar, em vez do socket.
   - Tratar erros do Graph: HTTP 4xx com `error.code` → mapear para `ErroEnvio` (alguns
     permanentes, ex.: número inválido; outros transitórios, ex.: rate limit 80007/130429).
2. **[COD]** No `server.ts`, escolher o provider por env (ex.: `WHATS_PROVIDER=meta|baileys`):
   instanciar `criarClienteMeta(...)` ou `criarClienteWhats(...)`. O resto
   (`registrarInboundWhats`, `iniciarScheduler`) não muda, recebe o `ClienteWhats`
   qualquer que seja a implementação. Com `meta`, **não** registra o lock nem o
   `whats.conectar()` do socket.
3. **[COD]** Tela de Conexão (admin): com provider Meta, a tela de QR perde sentido.
   Mostrar "Conectado via Meta Cloud API (número X)" lendo o status, sem QR. (O mini-chat
   de teste continua válido como ferramenta.)

---

## Fase 3 — Templates aprovados (mensagem que INICIA conversa)

Toda mensagem fora da janela de 24h (lembrete do ciclo, convite) precisa ser um
**template aprovado** pela Meta. O whaviso já tem a tabela `templates` e o editor em
`/admin/mensagens/:chave`, isso vira a fonte do conteúdo; falta **registrar e aprovar o
equivalente na Meta** e mapear.

1. **[META]** Em **WhatsApp → Message Templates → Create**: criar um template por
   mensagem que inicia conversa (ciclo `d_menos_2/d_menos_1/d/d_mais_1`, `convite.resumo`,
   notificações ao cobrador). Categoria geralmente **Utility** (lembrete de transação).
   Use variáveis `{{1}}`, `{{2}}`… no corpo e botões de **Quick reply** para as ações
   (Já paguei / Aceitar / etc.).
2. **[COD]** Mapear `templates.chave` (interno) → `name`+`language` do template Meta, e
   a ordem das variáveis `{{n}}` ↔ as variáveis que o `renderMensagem` já preenche. O
   envio de template usa `type: "template"` com `components[].parameters[]`.
3. **[META]** Aguardar **aprovação** (minutos a horas). Conteúdo tem que seguir as
   regras (sem promo enganosa); a linguagem do whaviso (sem travessão, gênero neutro,
   `historias/13-compliance.md`) ajuda a passar.
4. Dentro da janela de 24h (devedor respondeu) NÃO precisa de template: manda texto/
   interactive livre, igual hoje. O `webhook_whatsapp` já trata réplicas dentro da janela.

---

## Fase 4 — Ligar em teste e validar o fluxo inteiro

1. **[VPS]** Pôr os `META_*` (token de teste, phone_id, waba_id, app_secret,
   verify_token) no env do zap (`/etc/whaviso/whaviso.env`) e `WHATS_PROVIDER=meta`.
   Reiniciar o `whaviso-zap`.
2. **[TESTE]** Com os 5 destinatários de teste:
   - criar um aviso de teste cujo devedor seja um número de teste;
   - confirmar que o **convite/lembrete (template) chega**;
   - tocar os **botões** e ver o whaviso processar (aceite, já paguei) via webhook;
   - conferir `envios.entrega_status` mudando (sent→delivered→read).
   Isso valida o ciclo completo, que o self-send do Baileys **não** permite.

---

## Fase 5 — Produção (quando for ao ar pra valer)

1. **[META]** **Verificação de empresa** (Business Verification) no Business Manager:
   documentos da empresa. Libera limites maiores e produção.
2. **[META]** Adicionar o **número de produção** (seu chip/número da empresa) à WABA e
   **registrar** (ele deixa de poder usar o app normal do WhatsApp nesse número). Pegar o
   novo `PHONE_NUMBER_ID`.
3. **[META]** Criar um **System User** no Business Manager e gerar um **token permanente**
   (não expira em 24h) com permissões `whatsapp_business_messaging` +
   `whatsapp_business_management`. Esse é o `META_TOKEN` de produção
   (vai no `production.env`, nunca commitado).
4. **[META]** Subir o **tier de mensagens** conforme histórico (começa em 250/1k
   conversas/dia e cresce com bom comportamento).
5. **[VPS]** Trocar os `META_*` de teste pelos de produção no env e reiniciar. Manter o
   webhook apontando pro host de produção.

---

## O que NÃO muda (reaproveitado)

- `api`, front, contratos, login/OTP (o OTP pode inclusive ir por template/sessão Meta).
- Fila/outbox (`envios`, `notificacoes_cobrador`, `notificacoes_billing`) e o scheduler.
- Máquina de estados e toda a lógica de `webhook_whatsapp/service.ts` (só muda a FONTE
  do inbound: webhook em vez de socket).
- Tabela `templates` e o editor do admin (vira a fonte do conteúdo; o mapeamento pro
  template Meta é o que se adiciona).

## Riscos / atenção

- **Opt-in**: a Meta exige consentimento do destinatário para receber mensagem de
  negócio. O fluxo de convite/aceite do whaviso já é, na prática, o opt-in, documentar.
- **Categoria do template**: Utility (transação) tem custo/limite melhor que Marketing.
- **Webhook é crítico**: se cair, você perde respostas/status. Monitorar.
- Durante a transição dá pra manter `WHATS_PROVIDER` alternável (meta|baileys) sem
  arrancar o Baileys de uma vez.
