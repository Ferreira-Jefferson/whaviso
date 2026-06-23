# Épico 6: Ciclo de lembretes (D-2 a D+1)

> Este é o coração do pilar **Avisar**: depois que o combinado é aceito, o Whaviso dispara automaticamente uma sequência curta de lembretes por WhatsApp e para sozinho.
> **Quem recebe é sempre o devedor** (`telefone_devedor`), nos dois fluxos (receber e pagar invertido). No invertido o devedor é o próprio criador, mas o alvo dos lembretes não muda.
> **Ciclo padrão de no máximo 4 mensagens:** D-2, D-1, D (no dia) e D+1. Cada etapa tem função e texto distintos; nunca se repete o mesmo texto. O criador também pode definir uma janela/cadência própria (H6.10).
> Convenções de sempre: datas de negócio em **America/Sao_Paulo** (banco em UTC); **etapa e agendamento são calculados no servidor**, nunca no cliente; toda mensagem traz **opt-out visível**; linguagem sem travessão, sem palavras proibidas e **neutra quanto a gênero**.
> O que o devedor faz ao tocar os botões (Já paguei / Chave de Pag. / Desativar lembretes) é detalhado no **Épico 7**; a confirmação do pagamento, no **Épico 8**; as notificações ao cobrador, no **Épico 10**. Aqui o foco é **quando** cada mensagem sai e **com quais botões**.
> **Nomenclatura de estado:** o estado em que o combinado foi aceito e está no ciclo de envios passa a se chamar **`programado`** (no lugar de `pendente`); ver divergências.

---

### H6.1: Programar o ciclo ao aceitar 🟢
Como **sistema (zap/scheduler)**, quero programar os envios assim que o combinado é aceito, para os lembretes saírem nas datas certas sem ninguém agendar na mão.
*Critérios de aceite:*
- [ ] O ciclo só é ativado quando o combinado entra em **`programado`** (após o aceite, Épico 5); antes disso (`aguardando_aceite`, `sem_aviso`) **nada** é programado.
- [ ] As etapas do ciclo padrão são ancoradas na **data combinada** (`America/Sao_Paulo`): D-2 = 2 dias antes, D-1 = 1 dia antes, D = no dia, D+1 = 1 dia depois.
- [ ] A **etapa e o horário de cada envio são calculados no servidor**, nunca recebidos do cliente.
- [ ] Cada envio programado vira uma linha na **outbox (`envios`)**, com a etapa e o **timestamp** de disparo (data da etapa + horário reservado do combinado, ver H6.9).
- [ ] Se o aceite acontecer **depois** de alguma etapa já ter passado (ex.: aceitou em D-1), as etapas vencidas **não são reenviadas em lote**: o ciclo segue a partir da **próxima etapa aplicável** (ver H6.7).
- [ ] A programação respeita o estado: combinado em estado que pausa lembretes (`pausado`, `aguardando_aprovacao_aviso_editado`) ou terminal **não** dispara (ver H6.4).

---

### H6.2: As etapas, seus textos e botões 🟢
Como **devedor**, quero receber lembretes curtos e claros nas datas certas, para lembrar do combinado sem me sentir cobrado.
*Critérios de aceite:*
- [ ] **D-2 (2 dias antes), aviso antecipado, sem urgência.** Texto base: *"Oi, [nome]. [quem recebe] pediu pra te lembrar do combinado: [motivo], R$ X para [data]."*
- [ ] **D-1 (1 dia antes), organização.** Texto base: *"Oi, [nome]. Amanhã é o dia: [motivo], R$ X."*
- [ ] **D (no dia), confirmação.** Texto base: *"Oi, [nome]. Hoje é o dia: [motivo], R$ X."*
- [ ] **D+1 (1 dia depois), último aviso.** Texto base: *"Oi, [nome]. Último aviso: [motivo], R$ X."*
- [ ] **Os três botões aparecem em todas as etapas** (inclusive D-2): **Já paguei**, **Chave de Pag.** e **Desativar lembretes**. Não há etapa sem botão nem botão condicional.
- [ ] **A palavra "Pix" não vai no rótulo do botão:** o padrão é **"Chave de Pag."** (precaução contra bloqueio do WhatsApp por termo sensível). O Pix existe sempre, porque é obrigatório nos dois fluxos (ver H6.divergências e Épicos 2/3).
- [ ] O **valor** é exibido em reais (vindo de centavos) e a **data** no fuso `America/Sao_Paulo`.
- [ ] Os textos são o **padrão**; rótulos e conteúdo são **editáveis pelo owner** via templates (Épico 12). O `zap` é só o transporte.
- [ ] Nenhuma mensagem coleta texto livre: o devedor só interage por botão (Épico 7).

---

### H6.3: Cada mensagem é distinta e traz opt-out 🟢
Como **devedor**, quero que cada lembrete seja diferente e sempre me ofereça sair, para não receber spam repetido e poder me desligar a qualquer hora.
*Critérios de aceite:*
- [ ] As etapas têm **redação distinta** (função diferente: antecipar, organizar, confirmar, encerrar); o sistema nunca manda o mesmo texto duas vezes no mesmo ciclo.
- [ ] O tom é leve e informal quando couber (ex.: *"Só passando pra lembrar..."*), sempre dentro das regras de linguagem.
- [ ] **Toda** mensagem do ciclo traz o **opt-out visível** (botão Desativar lembretes), inclusive a primeira (D-2). Detalhe da saída no Épico 13.
- [ ] As mensagens seguem as regras de linguagem: sem travessão, sem palavras proibidas, **neutras quanto a gênero** (ex.: *"pediu pra te lembrar"*, não *"o/a [nome] pediu"*).

---

### H6.4: Parar o ciclo quando o combinado não deve mais avisar 🟢
Como **sistema (zap/scheduler)**, quero suspender os envios quando o combinado sai do estado de lembrar, para nunca mandar mensagem indevida.
*Critérios de aceite:*
- [ ] Em estado **terminal** (`pago`, `cancelado`, `recusado`, `expirado`), **nenhum** lembrete é enviado, mesmo que ainda haja envio programado na outbox: o envio é descartado/cancelado antes de sair.
- [ ] Em **`pausado`** e em **`aguardando_aprovacao_aviso_editado`**, os lembretes ficam **suspensos** enquanto durar o estado; ao voltar a `programado`, o ciclo retoma a partir da etapa aplicável à data (ver H6.7).
- [ ] O estado é reconferido **no momento do disparo** (não só no agendamento): se mudou entre programar e enviar, vale o estado atual.
- [ ] Desativar lembretes (opt-out do devedor) interrompe o ciclo imediatamente (efeito e estado resultante no Épico 7/13).
- [ ] Ao entrar em estado terminal ou em opt-out, o **horário reservado** do combinado é liberado (ver H6.9).

---

### H6.5: Quando o devedor informa que pagou 🟢
Como **devedor**, quero que os lembretes parem quando eu disser que paguei, mas que ainda haja um empurrãozinho se quem recebe não confirmar, para não ficar uma ponta solta.
*Critérios de aceite:*
- [ ] Ao tocar **Já paguei** (em qualquer etapa), o combinado vai para **`informado_pago`** e o **ciclo normal de lembretes para** (as etapas restantes não saem).
- [ ] **O cobrador é notificado imediatamente** de que o devedor informou pagamento (Épico 10).
- [ ] **Empurrãozinho de D+1:** se chegar em **D+1** e o cobrador **ainda não confirmou** (combinado segue em `informado_pago`), é enviada **uma** mensagem diferente ao devedor, ex.: *"Ei [nome], a data do pagamento foi ontem. Você já informou que pagou, mas [nome de quem recebe] ainda não confirmou. Qualquer coisa, manda um oi pra [nome de quem recebe]."*
- [ ] Essa mensagem de D+1 é a **única** que sai enquanto o combinado está em `informado_pago`; o texto normal das etapas não é usado nesse estado.
- [ ] Depois do empurrãozinho de D+1, nada mais é enviado automaticamente; o acompanhamento segue no painel até o cobrador confirmar (→ `pago`) ou rejeitar (→ `programado`), tratado no Épico 8.
- [ ] **O cobrador não recebe notificação a cada envio do ciclo** (não recebe "o aviso D-2 foi enviado"); só é notificado em **eventos do devedor** (já paguei, dado incorreto, recusa, opt-out), ver Épico 10.

---

### H6.6: Encerrar o ciclo em D+1 (limite de 4 mensagens) 🟢
Como **devedor**, quero que os lembretes parem depois do último aviso, para não ser avisado indefinidamente.
*Critérios de aceite:*
- [ ] No ciclo padrão, **D+1 é o último envio:** no máximo 4 mensagens por combinado (D-2, D-1, D, D+1); não há D+2, D+3, etc. (cadência própria fica na H6.10).
- [ ] Depois de D+1, **se o combinado ainda não foi pago/cancelado**, ele permanece **`programado`** (ou `informado_pago`) no painel, **sem novos lembretes automáticos**; o acompanhamento passa a ser pelo painel (Épico 9).
- [ ] Marcar como pago, cancelar ou rejeitar continua possível após o ciclo terminar (não depende de haver lembrete pendente).

---

### H6.7: Aceite tardio e datas já vencidas (catch-up) 🟢
Como **sistema (zap/scheduler)**, quero lidar com combinados aceitos perto ou depois da data, para enviar só o que ainda faz sentido e nunca disparar etapas vencidas em lote.
*Critérios de aceite:*
- [ ] Se o aceite ocorre **entre etapas** (ex.: em D-1), as etapas anteriores já vencidas **não são enviadas**; o ciclo começa na **próxima etapa cujo horário ainda não passou**.
- [ ] Se o aceite ocorre **no dia (D)** ou **depois (até D+1)**, o sistema envia apenas as etapas restantes aplicáveis (ex.: aceitou em D → manda D e D+1).
- [ ] Se o aceite ocorre **depois de D+1** (data já bem vencida), o sistema **não dispara nenhuma etapa do ciclo** (não há mensagem "atrasada"); o combinado fica `programado` no painel para acompanhamento manual.
- [ ] A mesma lógica de "só a próxima etapa aplicável" vale ao **retomar de uma pausa** (`pausado` / `aguardando_aprovacao_aviso_editado` → `programado`).

---

### H6.8: Entregar pela outbox, sem duplicar 🟢
Como **sistema (zap/scheduler)**, quero drenar a fila de envios com claim exclusivo, para cada lembrete sair uma única vez mesmo com concorrência.
*Critérios de aceite:*
- [ ] Os envios são lidos da outbox (`envios`) e reivindicados com **`FOR UPDATE SKIP LOCKED`** (sem fila externa/Redis).
- [ ] Cada etapa de cada combinado é enviada **no máximo uma vez** (idempotência): reprocessamento ou reinício do `zap` não duplica mensagem.
- [ ] **Retry:** em caso de falha de envio, são feitas **até 3 tentativas**, com intervalo **aleatório de 20 a 60 segundos** entre cada tentativa; esgotadas as 3, o envio é marcado como falho.
- [ ] O resultado de cada envio (enviado / falha / retry) é registrado para auditoria e visível no painel (estado do envio).
- [ ] **Nunca** logar telefone, Pix ou conteúdo sensível ao registrar envios.

---

### H6.9: Horário reservado de disparo (janela 8h-18h, granularidade de segundo) 🟢
Como **sistema (zap/scheduler)**, quero dar a cada combinado um horário próprio dentro da janela comercial e espalhar os envios segundo a segundo, para não disparar tudo no mesmo instante e reduzir risco de bloqueio do WhatsApp.
*Critérios de aceite:*
- [ ] Os lembretes só saem na **janela das 08:00:00 às 18:00:00** (`America/Sao_Paulo`).
- [ ] Cada combinado tem um **horário reservado** com granularidade de **segundo**; **dois combinados ativos nunca compartilham o mesmo segundo** (ex.: combinado 1 às 08:00:00, combinado 2 às 08:00:01).
- [ ] **Distância mínima por devedor:** dois avisos com o **mesmo devedor** (`telefone_devedor`) têm os horários reservados a **no mínimo 10 minutos** um do outro, para o devedor **nunca receber vários alertas quase juntos**. Na busca por segundo livre, segundos a menos de 10 min de outro aviso ativo **do mesmo devedor** são **pulados** (a unicidade global de segundo continua valendo entre todos os devedores).
- [ ] Se não houver janela que respeite os 10 min para aquele devedor (agenda muito cheia), vale o fallback da regra geral (segundo aleatório dentro da janela), registrando que o espaçamento ideal não coube.
- [ ] O horário é **definido no momento do aceite**:
  - [ ] Se o aceite ocorre **dentro da janela (8-18)**: o sistema tenta o **segundo atual**; se já estiver ocupado, procura o **segundo seguinte** livre, avançando um a um.
  - [ ] Se chegar em **18:00:00** sem achar livre, a busca **recomeça do 08:00:00**.
  - [ ] Se **todos** os segundos da janela estiverem ocupados, o sistema escolhe um **segundo aleatório** dentro da janela (colisão aceita só como último recurso).
  - [ ] Se o aceite ocorre **fora da janela**, a busca por segundo livre começa a partir das **08:00:00**.
- [ ] **Todas as etapas** do combinado (D-2, D-1, D, D+1) disparam no **mesmo horário reservado**, cada uma na sua data; no banco cada envio é um **timestamp** (data da etapa + horário reservado).
- [ ] Quando o combinado é **cancelado, concluído (`pago`) ou o devedor sai (opt-out)**, o campo do horário reservado vira **`null`**, liberando aquele segundo para outros combinados. Em **combinados recorrentes**, a liberação só acontece no **fim do período** (não entre ocorrências), ver Épico 8 H8.7.
- [ ] O **valor original** do horário reservado é guardado num **campo recuperável** (não só `null`): se o combinado for **reaberto** (`pago → programado`, Épico 8 H8.6), ele **reusa o mesmo horário**, fora da regra de busca de segundo livre e **mesmo que o segundo já esteja ocupado**.
- [ ] Mudança de horário de verão / fuso **não** desloca a etapa para outro dia civil (D-2 cai sempre 2 dias antes da data combinada no calendário local).

---

### H6.10: Janela e cadência de envio configuráveis pelo criador 🟡 (precisa de estudo de design)
Como **criador**, quero definir por quanto tempo e com que cadência os lembretes saem (por dia, semana ou mês, ou datas livres), para adaptar o aviso a cada combinado.
*Critérios de aceite:*
- [ ] O **padrão** é o ciclo D-2 a D+1 (H6.2); quem não configurar nada usa esse padrão.
- [ ] Na ativação/criação posso escolher **por quanto tempo** quero avisar e a **cadência** (ex.: diária, semanal, mensal) ou **datas avulsas**, com **total flexibilidade**.
- [ ] A quantidade de envios resultante respeita o **limite de envios do plano** (Épico 11).
- [ ] Etapa e agendamento continuam calculados no **servidor**; cada envio entra na outbox com seu timestamp e o mesmo horário reservado do combinado (H6.9).
- [ ] **Design clean:** a tela precisa oferecer essa flexibilidade sem ficar poluída; o layout exige **estudo de UX** (dívida de design registrada no README).

---

### Divergências com a definição atual

> A sequência de 4 mensagens e seus textos já estão previstos (PROJETO.md §3.3/§3.4) e a maquinaria de outbox + `SKIP LOCKED` já é a arquitetura decidida (CLAUDE.md). As divergências abaixo vêm de mudanças e decisões novas das histórias.

- **Renomear `pendente` → `programado`:** o estado pós-aceite no ciclo passa a se chamar `programado` (palavra que descreve o que está acontecendo). Já varrido nas histórias (épicos 2, 3, 5). Falta no **código** (máquina de estados: trigger no banco + app) e no **PROJETO.md/CLAUDE.md**.
- **`informado_pago` PARA o ciclo (inversão):** CLAUDE.md/PROJETO.md dizem "estado não-terminal, lembretes continuam". A história muda isso: ao informar pagamento, **os lembretes normais param**; a **única** mensagem possível depois é o **empurrãozinho de D+1** (se o cobrador não confirmou). Continua não-terminal (volta a `programado` se rejeitado), mas não dispara o ciclo normal. Refatoração no scheduler + textos.
- **Três botões fixos em toda etapa:** hoje o desenho (PROJETO.md §3.3) faz os botões variarem por etapa (Já paguei só de D, Ver Pix só com chave). Passa a ser **sempre os três** (Já paguei / Chave de Pag. / Desativar lembretes) em todas as etapas. Conferir o código do `zap`.
- **Rótulo sem a palavra "Pix":** o botão de Pix usa **"Chave de Pag."** por precaução de bloqueio do WhatsApp. **Confirmar** se o WhatsApp realmente bloqueia "Pix" em rótulo; se não bloquear, reavaliar o texto. Rótulo editável pelo owner (Épico 12).
- **Pix obrigatório nos dois fluxos:** decorre de "Chave de Pag." sempre presente. O Épico 2 (H2.1) dizia Pix **opcional** no fluxo receber; passa a ser **obrigatório** (já atualizado no Épico 2). No invertido já era obrigatório (Épico 3).
- **Pausa por estados novos:** o ciclo precisa respeitar `pausado` e `aguardando_aprovacao_aviso_editado` (Épico 2/3), que ainda não existem na máquina de estados.
- **Horário reservado por segundo (H6.9):** mecanismo novo de alocação de um segundo único por combinado na janela 8-18, com liberação (`null`) ao encerrar. Precisa de campo no `aviso`/`envios` e da lógica de busca de segundo livre. Não existe hoje.
- **Distância mínima de 10 min por devedor (H6.9):** além da unicidade global de segundo, a busca precisa pular segundos a menos de 10 min de outro aviso ativo do **mesmo devedor**. Lógica nova; soma-se à fila de entrega com cancelamento (Épico 10 H10.9).
- **Cadência configurável (H6.10):** hoje o ciclo é fixo D-2..D+1. Permitir janela/cadência custom é construção nova + estudo de UX.
- **Textos editáveis e neutros:** os textos das etapas e o empurrãozinho de D+1 vêm da tabela `templates` (Épico 12), garantidos neutros de gênero, sem travessão e sem palavras proibidas.

### Decisões tomadas
- **Renomear estado para `programado`** (no lugar de `pendente`).
- **Três botões sempre presentes:** Já paguei, Chave de Pag. (Pix), Desativar lembretes, em todas as etapas. Pix é obrigatório nos dois fluxos.
- **Rótulo do botão de Pix sem a palavra "Pix"** (padrão "Chave de Pag."), por precaução de bloqueio do WhatsApp.
- **`informado_pago` para os lembretes**, com exceção do **empurrãozinho de D+1** se o cobrador não confirmar; ao clicar Já paguei, o **cobrador é notificado**.
- **Cobrador não recebe notificação por envio** do ciclo normal (só em eventos do devedor).
- **Horário de disparo (H6.9):** janela 08:00:00-18:00:00, um segundo único por combinado, busca a partir do horário do aceite avançando segundo a segundo (com wrap e fallback aleatório), liberação do segundo (`null`) ao encerrar/sair.
- **Distância mínima de 10 min por devedor (H6.9):** dois avisos do mesmo devedor ficam a pelo menos 10 min; a busca pula segundos perto demais de outro aviso ativo do mesmo devedor (fallback aleatório se não couber).
- **Retry de envio (H6.8):** 3 tentativas, intervalo aleatório de 20 a 60 segundos.
- **Texto muda em `informado_pago`:** o único texto possível é o empurrãozinho de D+1.

### Decisões em aberto
- **H6.10 (cadência configurável):** precisa de **estudo de design/UX** para caber flexibilidade total numa tela clean; modelagem de dados da cadência custom a definir.
- **Confirmar bloqueio do WhatsApp por "Pix" em rótulo** (H6.2): valida se "Chave de Pag." é mesmo necessário.

### Fora de escopo deste épico
- ❌ O que cada botão faz quando tocado (Já paguei / Chave de Pag. / Desativar lembretes) e o evento `solicitou_pix` (Épico 7).
- ❌ Confirmação/rejeição do pagamento pelo cobrador e o estado `informado_pago` em si (Épico 8).
- ❌ Notificações ao cobrador (Épico 10).
- ❌ Layout do painel e estado dos envios na tela (Épico 9).
- ❌ Mecânica e textos do opt-out (Épico 13).
- ❌ Limites de envios por plano que restringem a cadência (Épico 11).
