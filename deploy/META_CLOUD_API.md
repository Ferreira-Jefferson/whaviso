# Meta Cloud API do WhatsApp: operação em produção

O WhatsApp do whaviso roda na **Meta Cloud API** (canal oficial de mensagem de negócio):
templates aprovados para iniciar conversa, janela de 24h para réplica, inbound por webhook.
O provider vive isolado atrás da interface `ClienteWhats` no `zap`
(`backend/apps/zap/src/shared/meta_client/`), então trocar de versão da API ou de detalhe de
transporte é pontual, sem tocar `api`, front, fila/outbox nem a máquina de estados.

Este é o runbook de **operação**: o que configurar na Meta, no código e no servidor para o
número ficar no ar e continuar entregando. Rode **um passo por vez**, confirmando antes de
seguir. Marcadores: **[META]** = painel da Meta (browser); **[COD]** = repositório; **[VPS]** =
servidor.

---

## 1. [META] Verificação da empresa (Business Verification)

No **Business Manager** (business.facebook.com), em **Configurações do negócio > Central de
Segurança**, conclua a **verificação da empresa** com os documentos legais (razão social, CNPJ,
comprovante). Sem empresa verificada os limites ficam presos no ambiente de teste. A verificação
sai em horas a alguns dias; acompanhe o status pela própria Central.

---

## 2. [META] Nome de exibição e registro do número na Cloud API

1. Adicione o **número da empresa** à WhatsApp Business Account (WABA) e aprove o **nome de
   exibição** (display name) em **WhatsApp Manager > Configurações do número**. O nome precisa
   bater com a marca real; a Meta revisa.
2. **Registre** o número na Cloud API (ele passa a ser controlado pela API):

   ```
   curl -X POST 'https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/register' \
     -H 'Authorization: Bearer {META_ACCESS_TOKEN}' -H 'Content-Type: application/json' \
     -d '{"messaging_product":"whatsapp","pin":"{PIN_6_DIGITOS}"}'
   ```

   Notas:
   - O `pin` é o PIN da **verificação em duas etapas** do número (6 dígitos). Guarde em segredo.
   - Limite de **10 tentativas por 72h**; estourar dá erro **133016**. Anote o PIN certo antes.
   - Registrar um número **real** faz ele **deixar de funcionar no app normal do WhatsApp**: use
     um chip dedicado ao whaviso.

---

## 3. [META] System User com token permanente

No Business Manager, crie um **System User** e gere um **token permanente** (não expira em 24h)
com as permissões **`whatsapp_business_messaging`** e **`whatsapp_business_management`**. Esse é o
`META_ACCESS_TOKEN` (vai no env do servidor, nunca commitado). Nunca logamos o token.

---

## 4. [COD] + [META] Webhook de inbound

A Meta entrega mensagens recebidas, cliques de botão e recibos de status por **POST HTTP** num
webhook. O `zap` já monta `GET/POST /webhook/whatsapp`:

- **GET**: handshake. Compara `hub.verify_token` com `META_VERIFY_TOKEN` e ecoa `hub.challenge`.
- **POST**: eventos. Valida a assinatura **`X-Hub-Signature-256`** (HMAC SHA-256 do corpo cru com
  `META_APP_SECRET`) e responde 200 rápido, processando em background.

No painel, em **WhatsApp > Configuration > Webhook**:
1. **Callback URL** pública, ex.: `https://api.whaviso.com/webhook/whatsapp` (roteando para o zap
   `:3002`). O endpoint é protegido pela assinatura, não por auth de usuário.
2. **Verify token** = o mesmo valor de `META_VERIFY_TOKEN`.
3. Após verificar, faça **Subscribe** aos campos **`messages`** (inbound e recibos de entrega) e
   **`message_template_status_update`** (aprovação/recusa de template em tempo real).

---

## 5. [META] + [COD] Templates

Toda mensagem que **inicia** conversa (fora da janela de 24h: ciclo de lembretes, convite,
notificações) precisa ser um **template aprovado**. O fluxo é pelo próprio painel do whaviso:

1. **[COD/painel]** No admin, edite a mensagem em **/admin/mensagens/:chave** e clique em
   **"Submeter à Meta"**. A `api` marca a versão para submissão (`meta_acao='criar'`).
2. O `zap` (módulo `sincronizar_templates`) drena a fila, **cria/edita o template na WABA** via
   Graph e grava o `meta_template_id`. Ninguém liga o status na mão: o **`status_meta` reflete o
   veredito real** da Meta, tanto pelo webhook `message_template_status_update` quanto pela
   reconciliação periódica.
3. Dentro da janela de 24h (o destinatário respondeu) a réplica é texto/interativo livre, sem
   template.

O OTP de login por telefone é um template **AUTHENTICATION** (`META_OTP_TEMPLATE`, padrão
`whaviso_otp`), registrado à parte por ter formato fixo.

---

## 6. [VPS] Env do zap

No `/etc/whaviso/whaviso.env` (o zap lê o prefixo próprio). As 4 primeiras são **exigidas no
boot**: sem elas o zap encerra com mensagem clara.

| Var | O que é |
|---|---|
| `META_ACCESS_TOKEN` | token permanente do System User (messaging + management) |
| `META_PHONE_NUMBER_ID` | Phone number ID do número na WABA |
| `META_APP_SECRET` | app secret (valida a assinatura do webhook) |
| `META_VERIFY_TOKEN` | token do handshake do webhook (você escolhe) |
| `META_WABA_ID` | WhatsApp Business Account ID (usado pelo sync de templates) |
| `META_GRAPH_URL` | base da Graph API (padrão `https://graph.facebook.com`) |
| `META_API_VERSION` | versão da Graph API (padrão `v23.0`) |

Depois de mexer no env: `systemctl restart whaviso-zap`.

---

## 7. Tier de mensagens

O número começa num tier de **250 conversas iniciadas por dia**, sobe para **1.000** e além
conforme o histórico de bom comportamento (qualidade alta, poucos bloqueios/denúncias). A Meta
promove o tier automaticamente; monitore a **qualidade do número** no WhatsApp Manager.

---

## O que NÃO muda

- `api`, front, contratos e o login/OTP por telefone.
- Fila/outbox (`envios`, `notificacoes_cobrador`, `notificacoes_billing`) e o scheduler.
- Máquina de estados e a lógica de `webhook_whatsapp/service.ts` (a fonte do inbound é o webhook).
- Tabela `templates` e o editor do admin como fonte do conteúdo.

## Riscos e atenção

- **Opt-in**: a Meta exige consentimento do destinatário. O fluxo de convite/aceite do whaviso já
  é, na prática, o opt-in; mantenha-o documentado.
- **Categoria do template**: UTILITY (transação) tem custo/limite melhor que MARKETING.
- **Webhook é crítico**: se cair, você perde respostas e recibos de status. Monitore.
- **Qualidade do número**: denúncias e bloqueios derrubam o tier e podem restringir o envio.
