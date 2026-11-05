# Roteiro dos vídeos de App Review (Meta) — whaviso (SEM narração)

Estado confirmado (05/11/2026): a WABA **"Whaviso" / +55 11 92545-1886** já está
**conectada** na Cloud API (nome aprovado, qualidade alta). Não precisa conectar nada via
Embedded Signup para gravar: dá para criar template e enviar/receber direto.

A Meta pede **dois vídeos**, um por permissão, mostrando a **interface do negócio** usando o
recurso (não a experiência do consumidor). Vídeo **sem narração**: cada cena leva uma
**legenda curta na tela em inglês** (overlay). Ritmo um pouco mais lento nos cliques.

Números para o teste:
- **Remetente (seu número de negócio):** +55 11 92545-1886 (WABA Whaviso).
- **Destinatário de teste:** 11988102679 ou 12981136787 (basta ter WhatsApp instalado; como o
  número é real e conectado, envia direto, sem allowlist).

---

## VÍDEO 1 — `whatsapp_business_management` (criar um template)

Onde: **WhatsApp Manager** (ferramenta da Meta) — a Meta aceita "seu app OU o WhatsApp
Manager" para este vídeo, e o whaviso hoje não tem tela de criação de template para o usuário
final. (Se o chat do Meta indicar um caminho de template dentro do whaviso, pode usar esse; o
WhatsApp Manager é o caminho à prova de falha.)

Duração: ~1 min.

1. Abrir o **WhatsApp Manager** da conta Whaviso.
   - Legenda (EN): *whatsapp_business_management — managing the WhatsApp Business Account.*
2. Ir em **Templates de mensagem → Criar template**.
3. Preencher: nome, categoria, idioma e o corpo da mensagem.
   - Legenda (EN): *Creating a new message template for the connected number.*
4. **Enviar para análise** (mostrar a confirmação de que foi submetido).
   - Legenda (EN): *Template submitted for approval via the management permission.*

Observação: para ESTE vídeo basta mostrar a **criação/submissão**; não precisa esperar o
template ser aprovado durante a gravação.

---

## VÍDEO 2 — `whatsapp_business_messaging` (enviar e receber)

Onde: **no whaviso** (whaviso.com), página **Conversas**. Prova mais limpa e que não depende
de template aprovado: usar a janela de 24h (mensagem livre após o cliente escrever).

Duração: ~1 a 2 min.

1. Entrar no **whaviso.com** com a conta de teste e abrir **Conversas**.
   - Legenda (EN): *whaviso — the restaurant's business panel. Opening Conversations.*
2. De um dos celulares de teste (11988102679 ou 12981136787), **mandar uma mensagem** para o
   **+55 11 92545-1886**. Mostrar a mensagem **chegando no whaviso** (webhook `messages`).
   - Legenda (EN): *A customer sends a WhatsApp message to the business number; it arrives in
     whaviso (whatsapp_business_messaging).*
3. **Responder a partir do whaviso** (dentro da janela de 24h). Mostrar a resposta saindo.
   - Legenda (EN): *The restaurant replies from whaviso.*
4. Mostrar a **resposta chegando no celular** de teste.
   - Legenda (EN): *The message is delivered and displayed on the WhatsApp client.*

Dica: deixe o celular de teste à mão (ou use o WhatsApp Web desse número numa aba) para a
etapa 4 poder ser capturada na gravação.

---

## Pré-voo (antes de apertar REC)

1. **Conta de teste no whaviso** logada (mesma que você entrega ao analista nas instruções).
2. Celular de teste (11988102679 ou 12981136787) com WhatsApp pronto para mandar/receber.
3. Acesso ao **WhatsApp Manager** da conta Whaviso (para o Vídeo 1).
4. Gravador: Win + G (Xbox Game Bar), OBS ou Loom. Salvar em MP4.
5. **Legendas** (vídeo mudo): adicione os textos de cada cena como overlay, no editor depois
   (CapCut, Clipchamp do Windows) ou com cartões de texto entre as cenas.
6. Gravar só a janela do navegador; fechar notificações pessoais; ritmo calmo.

---

## Textos para colar no formulário (em inglês)

**whatsapp_business_messaging:**
> whaviso is a SaaS platform for restaurants. Each restaurant connects its own WhatsApp
> Business Account (WABA) via Embedded Signup. We use this permission to send and receive
> messages on behalf of each restaurant — order confirmations, customer service and
> notifications — exclusively through the number the restaurant connected and authorized.
> The content is controlled by the restaurant; we do not send unsolicited messages.

**whatsapp_business_management:**
> We use this permission to configure and manage the WABA each restaurant connects via
> Embedded Signup: registering the number on the Cloud API, subscribing our app to receive
> message webhooks, and managing the customer's own message templates. Access is limited to
> the WABAs that customers explicitly connect and authorize.

**Instruções da análise (colar + preencher a conta de teste):**
> 1. Go to https://whaviso.com and sign in with the test account: [USER / PASSWORD].
> 2. Open Conversations.
> 3. Send a WhatsApp message from any phone to the connected business number.
> 4. See the message arrive in whaviso and reply from the panel; the reply is delivered to
>    the phone (whatsapp_business_messaging).
> 5. Template creation (whatsapp_business_management) is shown in the accompanying video via
>    WhatsApp Manager for the connected WhatsApp Business Account.

---

## Observações

- Vídeo **sem narração**: o idioma que importa é o das **legendas** e o dos **textos do
  formulário** (inglês).
- Pode gravar com o app em **Dev Mode**; o Live é o passo final, após a aprovação.
- Entregue cada vídeo como arquivo anexado OU link não listado (Drive/YouTube).
