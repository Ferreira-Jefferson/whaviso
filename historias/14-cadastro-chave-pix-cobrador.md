# Épico 14: Cadastro da chave pix pelo cobrador (fluxo invertido)

> No **fluxo pagar invertido** (criador = devedor, que convida o cobrador) a chave pix é **opcional** ao criar e ao aceitar: o devedor nem sempre conhece a chave de quem vai receber. Este épico cobre o caminho para o **cobrador informar a própria chave depois**, pelo WhatsApp, de forma guiada, e essa chave **chegar ao devedor** e ficar **vinculada ao combinado**.
> A coleta acontece por um **fluxo guiado (wizard)**, uma etapa por mensagem, porque chave, titular, banco e tipo em texto livre solto geram variações impossíveis de tratar. Cada etapa avança com a resposta, oferece **corrigir a anterior** e termina numa **confirmação consolidada**.
> Dois gatilhos abrem o fluxo: uma **oferta no aceite** (opt-in por botão) e um **pedido do devedor** (botão no lembrete). Nunca é automático nem obrigatório.
> O cobrador, ao **aceitar**, já ganha conta automática (Épico 5, H5.3), então no momento do wizard ele tem perfil e a chave pode ir para o cadastro de chaves dele e ser reaproveitada em combinados futuros.
> Vale **só no fluxo invertido e enquanto o combinado estiver sem chave**. No fluxo receber a chave já é obrigatória na criação (Épico 2), e este épico não se aplica.
> Convenções de sempre: sem travessão, sem palavras proibidas, **neutras quanto a gênero**; chave, titular, banco e telefone **nunca** em log.

---

### H14.1: Quando o cadastro de chave pelo cobrador se aplica 🟢
Como **sistema (zap)**, quero abrir o cadastro de chave só nos combinados invertidos que ainda não têm chave, para não pedir o que já existe nem atrapalhar o fluxo receber.
*Critérios de aceite:*
- [ ] O fluxo só se aplica quando o combinado tem **`direcao = pagar`** (invertido) **e** ainda está **sem chave** (`pix_chave` nulo).
- [ ] No fluxo **receber** (chave obrigatória na criação, Épico 2) o cadastro pelo cobrador **não** existe.
- [ ] Assim que o combinado **passa a ter chave** (por este fluxo), os dois gatilhos param de aparecer para ele (a oferta no aceite e o botão de pedido do devedor, H14.2 e H14.3).
- [ ] A chave informada vale **a partir do combinado que disparou o fluxo** e fica salva no cadastro do cobrador para reuso (H14.7).

---

### H14.2: Oferta no aceite (Gatilho A, opt-in por botão) 🟢
Como **cobrador**, quero, logo ao aceitar um combinado sem chave, ser convidado a informar minha chave pix, para que quem vai me pagar já receba a chave junto.
*Critérios de aceite:*
- [ ] O aceite acontece normalmente (Épico 5): o combinado vai de **`aguardando_aceite` → `programado`**. Este épico **não** altera a máquina de estados do aceite.
- [ ] Quando o combinado é invertido **e sem chave**, a resposta ao cobrador **não** é a confirmação simples de aceite: ele recebe a **oferta**, ex.: *"Combinado confirmado! Quer informar sua chave pix agora? Ela fica vinculada a este combinado para [devedor] te pagar com mais agilidade."* com os botões **[Informar chave]** e **[Agora não]**.
- [ ] A **notificação de aceite ao devedor** (Épico 10) só é enviada **depois** que o cobrador resolve a oferta:
  - [ ] Se o cobrador toca **[Informar chave]**: começa o wizard (H14.4); ao concluir, o devedor recebe **uma** notificação que junta aceite + chave (H14.7).
  - [ ] Se o cobrador toca **[Agora não]** (ou a sessão expira sem concluir, H14.8): o devedor recebe a **notificação de aceite normal**, e a chave poderá ser pedida depois pelo Gatilho B (H14.3).
- [ ] A oferta usa **no máximo 2 botões** (compatível com o canal atual e com a futura API oficial); nada de lista interativa.
- [ ] Se o combinado **já tem chave**, a oferta **não** aparece (a resposta de aceite é a de sempre).
- [ ] Mensagem neutra quanto a gênero, sem palavras proibidas.

---

### H14.3: Pedido pelo devedor (Gatilho B, botão no lembrete) 🟢
Como **devedor**, quero pedir a chave pix de quem vai receber quando ela ainda não foi informada, para conseguir pagar.
*Critérios de aceite:*
- [ ] Enquanto o combinado invertido estiver **sem chave**, o lembrete que vai ao **devedor** (Épico 6) mostra um botão extra **[Solicitar chave Pix]** (rótulo editável pelo owner, Épico 12, sem a palavra "Pix" se o owner preferir).
- [ ] O botão **substitui** o **[Chave Pix]** enquanto não há chave (não há o que mostrar); quando a chave passa a existir, volta o **[Chave Pix]** normal (Épico 7, H7.3) e o **[Solicitar chave Pix]** some.
- [ ] Ao tocar **[Solicitar chave Pix]**, o **cobrador** recebe a mesma oferta do Gatilho A (H14.2), no telefone dele; e o **devedor** recebe uma resposta neutra, ex.: *"Vamos pedir a chave a quem vai receber. Assim que ela chegar, você recebe aqui."*
- [ ] O pedido registra o evento **`pix_solicitada`** (auditoria, append-only), visível no painel (Épico 9).
- [ ] **Idempotente:** tocar de novo enquanto o pedido já está em aberto **não** dispara nova oferta repetida nem eventos duplicados.
- [ ] Vale a regra do último aviso (Épico 7, H7.7): só o botão do último lembrete age.

---

### H14.4: Wizard etapa a etapa (titular, instituição, chave) 🟢
Como **cobrador**, quero informar minha chave em passos curtos, um por mensagem, para não me confundir nem precisar digitar tudo de uma vez.
*Critérios de aceite:*
- [ ] Iniciado o fluxo (por **[Informar chave]**), o Whaviso pede **uma informação por mensagem**, nesta ordem:
  - [ ] **1. Titular:** ex.: *"Informe o nome do titular da chave."* (texto livre).
  - [ ] **2. Instituição:** ex.: *"Informe a instituição financeira (banco)."* (texto livre), com botão **[Corrigir anterior]**.
  - [ ] **3. Chave:** ex.: *"Informe a sua chave pix."* (texto livre), com botão **[Corrigir anterior]**.
- [ ] Cada resposta de texto do cobrador **avança** para a etapa seguinte e guarda o valor parcial.
- [ ] **[Corrigir anterior]** volta **uma etapa**, mantendo o que já foi preenchido nas outras, e repete a pergunta daquela etapa.
- [ ] Enquanto a sessão está ativa, **texto livre do cobrador é interpretado como resposta da etapa atual**, e não como número de convite nem comando de menu (Épico 7, H7.1).
- [ ] As mensagens do wizard são neutras quanto a gênero e sem palavras proibidas; chave, titular e banco **nunca** vão para log.

---

### H14.5: Tipo da chave inferido e confirmado 🟢
Como **cobrador**, quero que o tipo da minha chave seja reconhecido sozinho e só confirmado por mim, para não precisar escolher de uma lista grande.
*Critérios de aceite:*
- [ ] Depois da etapa da chave, o Whaviso **infere o tipo** (cpf, cnpj, email, telefone, aleatória) a partir do formato da chave, com a **mesma lógica que o painel já usa** (fonte única, ver "Decisões tomadas").
- [ ] Se a inferência tem um resultado, o Whaviso **confirma** com 2 botões, ex.: *"Isto parece Telefone. Confirmar?"* com **[Confirmar]** e **[Corrigir tipo]**.
  - [ ] **[Confirmar]** segue para a confirmação final (H14.6).
  - [ ] **[Corrigir tipo]** pede o tipo certo por **resposta numerada** (1. CPF · 2. CNPJ · 3. E-mail · 4. Telefone · 5. Chave aleatória), sem lista interativa.
- [ ] Se a inferência é **ambígua** (não dá para decidir), o Whaviso **pula a confirmação** e já pede o tipo pela mesma **resposta numerada** (1..5).
- [ ] A confirmação/correção do tipo usa **no máximo 2 botões** mais resposta numerada de fallback; nunca depende de mensagem de lista (compatível com a futura API oficial).

---

### H14.6: Confirmação consolidada antes de salvar 🟢
Como **cobrador**, quero revisar tudo de uma vez antes de salvar, para corrigir algo errado sem recomeçar.
*Critérios de aceite:*
- [ ] Antes de gravar, o Whaviso mostra um **resumo consolidado**, ex.: *"Confira: titular [titular], banco [banco], [tipo]: [chave]. Está certo?"* com botões **[Confirmar]** e **[Corrigir anterior]**.
- [ ] **[Corrigir anterior]** volta para a última etapa preenchida (chave/tipo), mantendo as demais.
- [ ] Só ao tocar **[Confirmar]** a chave é gravada e enviada (H14.7); enquanto não confirma, **nada** vai ao devedor.
- [ ] O resumo respeita as regras de linguagem; chave, titular e banco **não** vão para log.

---

### H14.7: Gravar a chave, vincular ao combinado e enviar ao devedor 🟢
Como **cobrador**, quero que minha chave fique salva e chegue a quem vai me pagar, para o combinado seguir com a chave certa.
*Critérios de aceite:*
- [ ] Ao **[Confirmar]** (H14.6), numa única operação consistente:
  - [ ] A chave é salva no **cadastro de chaves do cobrador** (perfil), com titular, banco e tipo, para reuso futuro.
  - [ ] O combinado guarda o **snapshot** da chave (chave, titular, banco), passando a ter chave para todos os efeitos (Épico 7, H7.3).
  - [ ] Registra o evento **`pix_cadastrada`** (auditoria, append-only), visível no painel (Épico 9).
- [ ] O **devedor é notificado** com a chave (Épico 10), ex.: *"[cobrador] enviou a chave pix do combinado [referência]: [chave]. Em nome de [titular], banco [banco]."*. Se o fluxo veio do Gatilho A (aceite), essa notificação **junta** o aceite e a chave numa só mensagem.
- [ ] O **cobrador** recebe uma confirmação neutra, ex.: *"Chave salva e enviada a [devedor]. Obrigado!"*.
- [ ] A partir daí o lembrete do devedor para de mostrar **[Solicitar chave Pix]** e o **[Chave Pix]** passa a entregar a chave (Épico 7, H7.3).
- [ ] **Idempotente:** confirmar de novo (clique duplo, mensagem repetida) **não** grava duas chaves, não duplica evento nem notificação.
- [ ] A chave, o titular, o banco e os telefones **nunca** aparecem em log.

---

### H14.8: Uma sessão por vez, abandono e expiração 🟢
Como **sistema (zap)**, quero controlar a sessão do wizard com segurança, para não misturar conversas nem deixar fluxo pela metade travando o combinado.
*Critérios de aceite:*
- [ ] Há **no máximo uma sessão de wizard ativa por telefone**; iniciar um novo fluxo enquanto há um ativo **retoma/recomeça** o mesmo, não cria dois.
- [ ] A sessão fica **amarrada ao combinado** que a disparou (`aviso_id`); se o cobrador tem mais de um combinado sem chave, o fluxo trata o que iniciou.
- [ ] Se o cobrador **abandona** (não responde), a sessão **expira** após um período de inatividade e é marcada como encerrada (sem DELETE, só muda de status).
- [ ] Na expiração de uma sessão aberta pelo **Gatilho A**, o devedor recebe a **notificação de aceite normal** (H14.2), para o aceite não ficar sem aviso.
- [ ] Concluir o wizard (H14.7) encerra a sessão; um novo pedido depois disso abre uma sessão nova.
- [ ] A sessão **nunca** é apagada do banco (regra de não-DELETE); o que muda é o status (ativa/concluída/cancelada).

---

### H14.9: Linguagem e privacidade do fluxo 🟢
Como **owner**, quero que todo o fluxo respeite as regras de ouro, para manter compliance e privacidade.
*Critérios de aceite:*
- [ ] Todas as mensagens (oferta, etapas, confirmações, notificação ao devedor) são **neutras quanto a gênero**, **sem travessão** e **sem palavras proibidas** (Épico 13).
- [ ] Os textos da oferta, das etapas, da confirmação do tipo, do resumo, da confirmação ao cobrador, da notificação ao devedor e o rótulo do botão **[Solicitar chave Pix]** são **editáveis pelo owner** (Épico 12).
- [ ] **Nada sensível em log:** chave, titular, banco, telefone do cobrador e do devedor nunca são logados (a redação de log cobre campos aninhados).
- [ ] Os botões usados no fluxo respeitam o **limite de até 3 botões** por mensagem e **não** usam lista interativa (limite da Meta Cloud API para mensagens de botão).

---

### Divergências com a definição atual

> Este épico é **novo**: não existe caminho hoje para o cobrador informar a chave depois da criação. As divergências abaixo são o que o código precisa ganhar.

- **Primeiro estado conversacional de várias etapas.** Hoje o webhook do `zap` é event-driven por combinado (cada toque é resolvido na hora, sem memória entre mensagens). O wizard introduz uma **sessão** com etapa atual e dados parciais, persistida no banco. É a primeira conversa multi-etapa do produto.
- **Chave de pagamento opcional no invertido.** Decorre da decisão recente (Épico 3, Pix opcional na criação/aceite do invertido). Antes a chave era obrigatória; agora pode faltar, e este épico cobre o preenchimento posterior.
- **Botão no lembrete do devedor condicionado ao estado da chave.** O lembrete passa a mostrar **[Solicitar chave Pix]** no lugar de **[Chave Pix]** enquanto o combinado invertido está sem chave (Épico 6 e 7 tocados, ver cross-refs).
- **Inferência do tipo de chave compartilhada.** A lógica de detectar o tipo a partir do formato (hoje só no front) vira **fonte única** no backend para o `zap` reusar (ver "Decisões tomadas").

### Decisões tomadas
- **Opt-in, nunca automático.** A chave só é pedida ao cobrador por escolha dele (oferta no aceite) ou a pedido do devedor (botão no lembrete). Não há cobrança automática de chave.
- **Oferta no aceite antes da notificação ao devedor.** Ao aceitar um invertido sem chave, o cobrador resolve a oferta antes de o devedor ser notificado: se informa a chave, o devedor recebe **uma** mensagem com aceite + chave; se recusa ou abandona, o devedor recebe a notificação de aceite normal (a expiração da sessão dispara essa notificação de fallback, para o aceite nunca ficar sem aviso).
- **Tudo por botão, tipo inferido + confirmado.** O fluxo gira em botões (até 3 por mensagem, sem lista interativa). O tipo da chave é **inferido** e só **confirmado** (2 botões); a pergunta explícita por **resposta numerada** (1..5) é fallback para tipo ambíguo ou correção. Isso mantém o fluxo compatível com a futura API oficial.
- **Fonte única da inferência de tipo.** A detecção do tipo de chave passa a viver em `@whaviso/shared` (backend), e o front passa a **espelhar/importar** essa lógica, como já acontece com as regras de linguagem.
- **Reuso do que já existe.** A chave vai para o **cadastro de chaves do cobrador** (que já guarda titular/banco/tipo) e para o **snapshot do combinado** (campos de chave/titular/banco que já existem). A notificação ao devedor reusa a outbox e o disparo best-effort já existentes (Épico 10).
- **Corrigir anterior em toda etapa** e **confirmação consolidada** antes de gravar.
- **Sessão única por telefone**, amarrada ao combinado, com expiração por inatividade e sem DELETE (só muda de status).

### Decisões em aberto
- **Janela de expiração da sessão:** tempo exato de inatividade até encerrar a sessão (e disparar a notificação de aceite de fallback do Gatilho A) a definir na implementação.
- **Rótulo final do botão de pedido:** "Solicitar chave Pix" é provisório; o texto é editável pelo owner (Épico 12) e pode evitar a palavra "Pix" por precaução de canal, como o **[Chave Pix]** (Épico 7).

### Fora de escopo deste épico
- ❌ Captura da chave **na criação** do combinado (Épicos 2 e 3) e edição da chave pelo painel.
- ❌ Como o devedor **vê** a chave depois de cadastrada (botão **[Chave Pix]**, Épico 7, H7.3).
- ❌ Conteúdo, janela e canal das **notificações** em si (Épico 10).
- ❌ Edição dos **textos/templates** do fluxo (Épico 12) e regras gerais de **linguagem/opt-out** (Épico 13).
- ❌ Como os eventos `pix_solicitada` e `pix_cadastrada` aparecem no **painel** (Épico 9).
