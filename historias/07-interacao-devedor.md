# Épico 7: Interação do devedor (Já paguei / Chave Pix / Desativar lembretes)

> O devedor **não conversa**: não existe chat humano, IA, nem Pix automático. Ele só interage pelos **três botões** que acompanham toda mensagem do ciclo (Épico 6): **Já paguei**, **Chave Pix** e **Desativar lembretes**.
> Cada toque chega ao `zap` como um evento de webhook **autenticado por HMAC**, carregando o **`aviso_id`** (e o identificador do aviso/etapa) no payload, nunca o token, para o Whaviso saber exatamente de qual combinado e de qual mensagem se trata.
> **Regra central:** só os botões do **último aviso enviado** do combinado têm efeito; botões de mensagens anteriores ficam inertes (ver H7.7).
> Este épico cobre **o que cada botão faz** e a resposta que o devedor recebe. As notificações ao cobrador ficam no Épico 10; a confirmação do pagamento, no Épico 8; a abrangência/compliance do opt-out, no Épico 13.
> Convenções de sempre: sem travessão, sem palavras proibidas, **neutras quanto a gênero**; nada de telefone/Pix/token em log.

---

### H7.1: O devedor só age por botão (sem chat) 🟢
Como **devedor**, quero responder com um toque e não ter que digitar nada, para resolver o combinado sem conversa.
*Critérios de aceite:*
- [ ] As únicas ações possíveis para o devedor são os botões **Já paguei**, **Chave Pix** e **Desativar lembretes**.
- [ ] Não há chat humano, IA, nem Pix automático: o Whaviso **não responde livremente** a texto do devedor.
- [ ] Se o devedor **digita texto livre**:
  - [ ] **Texto livre do devedor:** a conta responde com um **menu de opções** com as ações disponíveis (Já paguei / Chave Pix / Desativar lembretes) referente ao(s) combinado(s) ativo(s). **Disponível para todas as contas** (não há distinção de plano; modelo de créditos, Épico 11). O menu é resposta a texto, não um lembrete, e **não consome crédito de envio**.
  - [ ] O menu é um **conjunto fechado de opções, não um chat**: o Whaviso não conversa (Épico 13 H13.7). Fora dos botões/menu, silêncio.
- [ ] Cada toque de botão é um evento de webhook **autenticado por HMAC**; o payload traz o **`aviso_id`** e o identificador do aviso/etapa, nunca o token nem dado sensível.
- [ ] Toda resposta respeita as regras de linguagem (neutra de gênero, sem palavras proibidas).

---

### H7.2: Tocar "Já paguei" 🟢
Como **devedor**, quero avisar que paguei com um toque, para que quem vai receber saiba e os lembretes parem.
*Critérios de aceite:*
- [ ] O botão **Já paguei** aparece em **todas as etapas** do ciclo (mas só age no último aviso, H7.7).
- [ ] Ao tocar, o combinado vai para **`informado_pago`** e o **ciclo normal de lembretes para** (Épico 6 H6.5).
- [ ] O **cobrador é notificado** imediatamente de que o devedor informou pagamento (Épico 10).
- [ ] O devedor recebe uma resposta neutra de confirmação, ex.: *"Combinado, vou avisar quem fez o acordo com você. Obrigado!"*
- [ ] **Idempotente:** tocar "Já paguei" de novo enquanto já está em `informado_pago` **não faz nada** e **não envia mais mensagem nenhuma** (nem confirmação, nem menu) e não cria evento/notificação duplicados.
- [ ] A transição registra evento de auditoria (append-only).
- [ ] A confirmação/rejeição pelo cobrador (que tira de `informado_pago`) é tratada no Épico 8.

---

### H7.3: Tocar "Chave Pix" (ver o Pix) 🟢
Como **devedor**, quero ver a chave Pix com o nome e o banco de quem recebe, para copiar, conferir o destinatário e pagar com segurança.
*Critérios de aceite:*
- [ ] O botão **Chave Pix** aparece em **todas as etapas** (o Pix é obrigatório nos dois fluxos, Épico 6); o rótulo **pode conter a palavra "Pix"** (a precaução de bloqueio era da época do WhatsApp não oficial, resolvida com a migração para a Meta Cloud API oficial), editável pelo owner (Épico 12).
- [ ] A chave salva pelo cobrador inclui **nome do titular** e **banco**; esses dados compõem a resposta.
- [ ] Ao tocar, o Whaviso envia **duas mensagens em sequência** (intervalo de até **3 segundos** entre elas):
  - [ ] **1ª:** só a chave, fácil de copiar, ex.: *"Chave de pagamento: [chave]"*.
  - [ ] **2ª:** o titular e o banco, ex.: *"Em nome de [nome], banco [banco]."*
- [ ] O evento **`solicitou_pix`** é registrado **apenas no primeiro toque** (sinal de intenção, visível no painel, Épico 9); toques seguintes não registram de novo.
- [ ] A chave é **(re)enviada a cada toque** em "Chave Pix" de um combinado ativo (as duas mensagens acima). Um toque é um **pedido explícito do devedor**, não spam: a resposta é **réplica na janela de 24h** e **não consome crédito** (igual ao menu e à cortesia "encerrado"). *(Revisado em 2026-07-20: antes a entrega era única por combinado e o re-toque ficava em silêncio; na prática, tocar e não ver nada parecia app quebrado, principalmente com vários combinados na mesma conversa.)*
- [ ] Tocar "Chave Pix" **não muda o estado** do combinado.
- [ ] A chave, o nome e o banco **nunca** aparecem em log.

---

### H7.4: Tocar "Desativar lembretes" (sair do combinado) 🟢
Como **devedor**, quero parar de receber os lembretes de um combinado com um toque, podendo voltar atrás, para não ser avisado quando não quiser sem perder o combinado de vez.
*Critérios de aceite:*
- [ ] O botão **Desativar lembretes** aparece em **toda** mensagem do ciclo (opt-out sempre visível, regra de ouro).
- [ ] Ao tocar, o combinado entra no estado **`desregistrado`** e **nenhum lembrete** é enviado a partir daí.
- [ ] **Abrangência:** afeta **somente este combinado**; os outros combinados do mesmo número seguem normalmente.
- [ ] O **horário reservado** do combinado é setado para **`null`** (Épico 6 H6.9), liberando aquele segundo para outros combinados.
- [ ] O devedor recebe uma mensagem de confirmação que **contém um botão "Ativar lembretes"** (para voltar atrás), ex.: *"Pronto, você não vai mais receber lembretes deste combinado. Mudou de ideia? Toque em Ativar lembretes."*
- [ ] **Notificação ao cobrador com atraso:** o aviso ao cobrador (Épico 10) é enviado **só 1 minuto depois**, porque nesse intervalo o devedor pode reativar; se reativar dentro do minuto, a notificação **não** é enviada.
- [ ] `desregistrado` **não apaga** o combinado do banco (regra de não-DELETE); o evento de saída é registrado (auditoria).
- [ ] `desregistrado` **não é terminal**: o devedor pode reativar (H7.5).

---

### H7.5: Reativar lembretes (voltar a um combinado desregistrado) 🟢
Como **devedor**, quero voltar a receber os lembretes que eu havia desativado, para retomar o combinado sem precisar de um novo envio.
*Critérios de aceite:*
- [ ] O botão **Ativar lembretes** (da mensagem da H7.4) tira o combinado de **`desregistrado` → `programado`** e o ciclo volta a valer.
- [ ] Como o horário reservado foi zerado (e outro combinado pode tê-lo tomado), a reativação **pega um novo horário reservado** seguindo a regra de timestamp (Épico 6 H6.9).
- [ ] A mensagem de confirmação da reativação **não tem nenhum botão**, ex.: *"Você está novamente registrado neste combinado."*
- [ ] **Notificação ao cobrador conforme o estado:**
  - [ ] Se reativar **dentro do 1 minuto** (a notificação de saída ainda não foi enviada): nada é notificado ao cobrador (saída e volta se anulam).
  - [ ] Se reativar **depois** de a notificação de saída já ter sido enviada: o cobrador recebe **uma nova notificação** informando que a pessoa se registrou de novo neste combinado (Épico 10).
- [ ] A reativação retoma o ciclo pela **etapa aplicável à data** (catch-up, Épico 6 H6.7).
- [ ] A reativação é registrada como evento (auditoria).

---

### H7.6: O toque sempre cai no combinado certo 🟢
Como **sistema (zap)**, quero mapear cada toque ao combinado exato pelo `aviso_id`, para acertar o alvo mesmo quando o número tem vários combinados.
*Critérios de aceite:*
- [ ] O webhook usa o **`aviso_id`** do payload (autenticado por HMAC) para localizar o combinado; não depende de "qual foi a última mensagem do chat".
- [ ] Se o mesmo telefone tem **vários combinados ativos**, o toque afeta **somente** o combinado daquele botão.
- [ ] A ação só é aplicada se o telefone que respondeu **corresponde** ao alvo do combinado (`telefone_devedor`); caso contrário é ignorada (e nada sensível é logado).
- [ ] Toda ação é **idempotente** e registrada como evento de auditoria.

---

### H7.7: Só os botões do último aviso agem; combinado encerrado ou inválido 🟢
Como **devedor**, quero que valha o que está mais recente, para não acionar por engano um botão de uma mensagem antiga.
*Critérios de aceite:*
- [ ] Apenas os botões do **último aviso enviado** do combinado têm efeito; tocar um botão de uma mensagem **anterior** do mesmo combinado **não dispara ação de estado**.
- [ ] Isso vale para os três botões, inclusive **Chave Pix** (reenviada a cada toque, mas **só pelo último aviso**: tocar "Chave Pix" numa mensagem antiga do mesmo combinado não reenvia, cai na cortesia "encerrado").
- [ ] Se o combinado já está em **estado terminal** (`pago`, `cancelado`, `recusado`, `expirado`), tocar qualquer botão **não reabre** o combinado nem dispara ação.
- [ ] Nesses casos o devedor recebe uma resposta neutra, ex.: *"Este combinado já foi encerrado, não há mais nada a fazer por aqui."*
- [ ] Se o `aviso_id` for inválido/desconhecido, o toque é ignorado **sem vazar** se o combinado existe ou não.

---

### Divergências com a definição atual

> "Ver Pix" como mensagem separada, evento `solicitou_pix` e "o devedor não conversa" já estão no PROJETO.md (§3.3/§3.4). As divergências abaixo vêm de mudanças das histórias e de riscos do canal.

- **Pix com titular + banco:** a chave salva pelo cobrador passa a guardar **nome do titular** e **banco**, usados na 2ª mensagem da H7.3. A captura do Pix nos Épicos 2 (H2.1) e 3 (H3.1) precisa coletar esses campos (já atualizado lá). Pode justificar um cadastro de "chaves salvas" do cobrador.
- **Entrega da chave uma vez por combinado:** muda o comportamento "cada toque reenvia"; agora só o 1º toque entrega e registra `solicitou_pix`, com reenvio só em falha confirmada de servidor.
- **Estado `desregistrado` (opt-out reversível):** hoje o opt-out cai em `cancelado` (PROJETO.md §4) e seria terminal. Passa a ser **estado próprio, reversível** pelo devedor (botão Ativar lembretes), distinto de `pausado` (quem pausa é o criador), `cancelado` (criador cancela) e `recusado` (convidado recusa o combinado). Novas transições: `programado → desregistrado` (sair) e `desregistrado → programado` (reativar).
- **Notificação ao cobrador com atraso de 1 minuto:** o aviso de opt-out ao cobrador espera 1 min para absorver uma reativação rápida; e a reativação pós-notificação gera uma 2ª notificação. Lógica nova de janela/agendamento de notificação (Épico 10).
- **Só o último aviso age (H7.7):** exige que o payload do botão identifique **o aviso/etapa**, e que o sistema saiba qual é o último envio do combinado, para invalidar botões de mensagens antigas. Não existe hoje.
- **Menu de opções para texto livre:** resposta automática ao texto livre do devedor, **disponível para todas as contas** (não há mais distinção de plano; modelo de carteira de créditos, Épico 11). A resposta do menu é uma réplica dentro da janela de atendimento, não um lembrete, então **não consome crédito de envio**. Lógica nova.
- **Fallback de resposta numerada (resiliência):** além dos botões interativos oficiais da Meta, o sistema mantém um **fallback** de resposta numerada como resiliência geral do canal, não como workaround pendente.

### Decisões tomadas
- **Texto livre:** todas as contas recebem um menu de opções (não há distinção de plano; modelo de créditos, Épico 11). Depois de "Já paguei", nem isso (silêncio total para aquele combinado).
- **"Já paguei" idempotente e silencioso na repetição** (não reenvia nada).
- **"Chave Pix" entrega duas mensagens** (chave; depois titular + banco, até 3s de intervalo), **uma vez por combinado**, `solicitou_pix` só no 1º toque, reenvio só em falha de servidor.
- **Opt-out = estado `desregistrado`, reversível** (botão Ativar lembretes), só o combinado em questão, libera o horário reservado.
- **Reativação** pega novo horário reservado, mensagem sem botão, e notifica o cobrador só se a notificação de saída já tiver saído; notificação de saída atrasada em **1 minuto**.
- **Só os botões do último aviso agem** (H7.7); "Chave Pix" após encerrado: nada (só uma vez por combinado, só no último aviso).

### Decisões em aberto
- Nenhuma pendente neste épico.

### Fora de escopo deste épico
- ❌ As notificações ao cobrador em si (texto, canal, janela de 1 min, sem conta) (Épico 10).
- ❌ Confirmação/rejeição do pagamento e o ciclo de vida do `informado_pago` (Épico 8).
- ❌ Abrangência ampla e compliance do opt-out (Épico 13).
- ❌ Como esses eventos (`solicitou_pix`, opt-out, reativação, já paguei) aparecem no painel (Épico 9).
- ❌ Como o cobrador cadastra a própria chave quando o invertido nasceu sem ela (Épico 14).
