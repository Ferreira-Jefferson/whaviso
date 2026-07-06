# Épico 8: Confirmação de pagamento (informado_pago)

> Fecha o ciclo do dinheiro: depois que o devedor informa que pagou (Épico 7 H7.2), **quem recebe** (o cobrador) precisa **confirmar** ou **rejeitar** esse pagamento. Só o cobrador encerra o combinado: o Whaviso nunca confirma pagamento sozinho, não conhece Pix nem extrato.
> **Estado central:** `informado_pago` (não-terminal): o devedor disse que pagou, falta o cobrador confirmar. Transições deste épico: `informado_pago → pago` (confirma), `informado_pago → programado` (rejeita), `programado → pago` (marcar direto), `pago → programado` (reabrir).
> **Dois canais, para qualquer cobrador:** o cobrador pode confirmar/rejeitar pelo **painel** (quando tem conta) **ou** por **botão no WhatsApp** (sempre, tenha conta ou não). O botão no WhatsApp não é exclusividade de quem não tem conta.
> **Combinados recorrentes:** um combinado pode ter várias ocorrências (ex.: todo dia 10 por 5 meses). Cada ocorrência espera um pagamento (devedor informa) e uma confirmação (cobrador). O combinado **só vira terminal (`pago`) no fim da última ocorrência**; o horário reservado **só vira `null` quando as ocorrências acabam** (ver H8.7).
> **Janela de reversão de 1 minuto:** ações que mandam mensagem ao devedor (confirmar pagamento) só **disparam a mensagem ~1 minuto depois**, para o cobrador reverter um clique errado sem o devedor ver nada (mesmo padrão do opt-out, Épico 7 H7.4).
> O **texto e o canal** das notificações ao cobrador ficam no Épico 10; como isso aparece no painel, no Épico 9. Convenções de sempre: sem travessão, sem palavras proibidas, **neutras quanto a gênero**; dinheiro em **centavos**, datas em **America/Sao_Paulo**; nada de telefone/Pix/token em log; nada é apagado (estados, não DELETE).

---

### H8.1: Cobrador confirma o pagamento (informado_pago → pago) 🟢
Como **cobrador**, quero confirmar que recebi o pagamento, para encerrar o combinado (ou a ocorrência atual) e parar os lembretes.
*Critérios de aceite:*
- [ ] A confirmação só é possível quando o combinado está em **`informado_pago`** ou em **`programado`** (marcar direto, H8.4).
- [ ] **Combinado simples (sem recorrência):** ao confirmar, vai para **`pago`** (terminal): nunca mais envia lembrete e não reabre automaticamente.
- [ ] **Combinado recorrente:** confirmar fecha **a ocorrência atual**, mas o combinado **continua vivo** até a última ocorrência; só a última confirmação leva a `pago` terminal (ver H8.7).
- [ ] **Liberação do horário reservado** (vira `null`, Épico 6 H6.9) só acontece quando **não há mais ocorrências** (combinado simples ao confirmar; recorrente só no fim).
- [ ] Ao virar `pago` terminal, qualquer envio ainda pendente na outbox (`envios`) é **descartado** antes de sair (reconferência de estado no disparo, Épico 6 H6.4).
- [ ] **Mensagem ao devedor com atraso de ~1 minuto:** a mensagem de encerramento só é **disparada cerca de 1 minuto depois** da confirmação, para o cobrador poder reverter (H8.6); se reabrir dentro do minuto, a mensagem **não** sai.
- [ ] A mensagem de encerramento é neutra e **sem botões**, ex.: *"Tudo certo, o pagamento foi confirmado. Combinado encerrado, obrigado!"* (no recorrente, ex.: *"Pagamento deste mês confirmado, obrigado! O próximo lembrete chega perto da próxima data."*)
- [ ] A confirmação é registrada como evento de auditoria (append-only), com quem confirmou e quando.
- [ ] Confirmar de novo um combinado já `pago` (ou uma ocorrência já confirmada) é **idempotente**: não muda nada e não dispara mensagem/evento duplicado.

---

### H8.2: Cobrador rejeita o pagamento informado (informado_pago → programado) 🟢
Como **cobrador**, quero sinalizar que ainda não localizei o pagamento, para o combinado voltar ao ciclo em vez de ser encerrado por engano.
*Critérios de aceite:*
- [ ] A rejeição só é possível quando o combinado está em **`informado_pago`**.
- [ ] Ao rejeitar, o combinado **volta para `programado`** e o ciclo retoma pela etapa aplicável à data (catch-up, Épico 6 H6.7); se a data já passou de D+1, fica `programado` no painel sem novos lembretes automáticos (Épico 6 H6.6).
- [ ] O **horário reservado não muda:** ele nunca foi liberado em `informado_pago` (só vira `null` no terminal/opt-out), então a rejeição **não realoca** nada.
- [ ] O evento registrado é **`rejeitado_cobrador`** (auditoria append-only); o evento de que o devedor havia informado pagamento **permanece** no histórico.
- [ ] O **devedor é notificado** de forma neutra e sem acusação (sem "dívida/atraso/cobrança"), ex.: *"Quem combinou com você ainda não localizou o pagamento. Se você já pagou, pode aguardar ou conferir os dados; os lembretes continuam normalmente."* (Épico 10 trata texto/canal.)

---

### H8.3: Reengajar quando o pagamento não foi localizado (pós-ciclo) 🟢
Como **cobrador**, quero, depois que o ciclo de avisos terminou sem pagamento, mandar um aviso de que ainda não localizei o pagamento, para reabrir a conversa sem recriar o combinado.
*Critérios de aceite:*
- [ ] Disponível quando o ciclo padrão **já terminou** (passou de D+1) e o combinado segue **`programado`** sem pagamento confirmado.
- [ ] O cobrador dispara, pelo painel, **uma** mensagem ao devedor, ex.: *"Olá [nome], [nome de quem recebe] pediu para avisar que ainda não localizou o pagamento do combinado: [combinado]."*
- [ ] Essa mensagem leva os **três botões padrão** (Já paguei / Chave de Pag. / Desativar lembretes), e ela passa a ser o **último aviso** do combinado (os botões dela é que valem, Épico 7 H7.7).
- [ ] O combinado **não muda de estado** ao enviar esse reengajamento (continua `programado`); o disparo é registrado como evento.
- [ ] Sai **dentro da janela 8h-18h** e no **horário reservado** do combinado (Épico 6 H6.9), como qualquer envio; consome do **saldo de créditos** (Épico 11).
- [ ] Pode haver limite de quantos reengajamentos manuais o cobrador dispara (a definir no Épico 11); por padrão, ação consciente do cobrador, não automática.

---

### H8.4: Cobrador marca como pago direto (sem o devedor ter informado) 🟢
Como **cobrador**, quero marcar um combinado como pago a qualquer momento, para registrar pagamentos que aconteceram por fora (dinheiro, transferência manual) sem depender do botão do devedor.
*Critérios de aceite:*
- [ ] A partir de **`programado`** (ou de `informado_pago`), o cobrador pode marcar como **`pago`** direto.
- [ ] O efeito é o mesmo da H8.1 (terminal/ocorrência, liberação de horário só no fim, descarte de envios pendentes, mensagem de encerramento ao devedor com atraso de ~1 min), inclusive a regra de **recorrência** (marca a ocorrência atual; terminal só no fim).
- [ ] Marcar como pago **não depende** de o devedor ter tocado "Já paguei" (não precisa passar por `informado_pago`).
- [ ] A transição registra **quem** marcou (cobrador, não devedor), para o painel diferenciar "informado pelo devedor" de "marcado/confirmado pelo cobrador" (Épico 9).

---

### H8.5: Confirmar ou rejeitar por botão no WhatsApp (qualquer cobrador) 🟢
Como **cobrador** (com conta ou não), quero confirmar ou rejeitar o pagamento por botão no WhatsApp, para fechar o combinado sem precisar abrir o painel.
*Critérios de aceite:*
- [ ] Quando o devedor informa pagamento, a notificação ao cobrador (Épico 10) vai com botões de ação: **Confirmar pagamento** e **Ainda não recebi**, **independente de o cobrador ter conta**.
- [ ] **Confirmar pagamento** produz o efeito da H8.1 (`informado_pago → pago`, com a janela de 1 min e a regra de recorrência); **Ainda não recebi** produz o da H8.2 (`informado_pago → programado`, evento `rejeitado_cobrador`).
- [ ] Quem tem conta também pode fazer tudo pelo **painel**; o WhatsApp é um canal adicional, não substituto.
- [ ] O toque chega como webhook **autenticado por HMAC**, carregando o **`aviso_id`** (nunca o token), e só é aplicado se o telefone que respondeu **corresponde** ao alvo da notificação daquele combinado (cobrador com conta: telefone do profile; sem conta: `telefone_cobrador`); senão é ignorado, sem vazar se o combinado existe.
- [ ] A ação é **idempotente** e vale a regra de só o último aviso agir (Épico 7 H7.7).
- [ ] Para cobrador sem conta, há uma **CTA discreta** de criar conta junto da confirmação (nunca obrigatória).
- [ ] **Fallback de resposta numerada:** além dos botões interativos oficiais da Meta, existe um fallback de resposta numerada como resiliência geral do canal (mesmo mecanismo do Épico 7).

---

### H8.6: Reabrir um combinado pago por engano (pago → programado) 🟢
Como **cobrador**, quero poder reabrir um combinado que marquei como pago sem querer, para corrigir o erro sem recriar tudo e mantendo o mesmo horário de envio.
*Critérios de aceite:*
- [ ] É possível sair de **`pago` → `programado`** (reabertura), restrito a **quem recebe** (o cobrador), pelo painel ou pelo botão do WhatsApp.
- [ ] **Reuso do horário:** ao virar `pago`, o horário reservado vira `null` (libera o segundo), mas o valor original é guardado em um **campo recuperável**. Na reabertura, o combinado **reusa exatamente o mesmo horário**, **sem** passar pela regra de escolha de timestamp (Épico 6 H6.9), **mesmo que aquele segundo já esteja ocupado** por outro combinado (colisão aceita neste caso específico).
- [ ] Ao reabrir, o combinado volta ao ciclo por catch-up (Épico 6 H6.7), **sem** reenviar etapas vencidas em lote.
- [ ] **Janela de 1 minuto da confirmação:** se a reabertura ocorre **dentro do ~1 minuto** após confirmar (a mensagem de encerramento ainda não saiu), o devedor **não recebe nada** (confirmação e reabertura se anulam). Se ocorre **depois** (mensagem de encerramento já enviada), o devedor recebe **outra mensagem** informando que o status foi alterado, ex.: *"Houve um ajuste: o combinado [combinado] voltou a ficar ativo. Em caso de dúvida, fale com [nome de quem recebe]."*
- [ ] A reabertura é registrada como evento de auditoria; o histórico anterior (inclusive o `pago`) **não** é apagado.
- [ ] Esta é a **única** saída de `pago`: nenhum fluxo automático tira um combinado de `pago`; só ação humana do cobrador reabre.

---

### H8.7: Combinados recorrentes: confirmação por ocorrência 🟢 (modelagem decidida; em implementação)
Como **cobrador** de um combinado recorrente, quero confirmar o pagamento de cada ocorrência sem encerrar o acordo todo, para o combinado seguir vivo até o fim do período.
*Critérios de aceite:*
- [ ] Um combinado recorrente tem **N ocorrências** (ex.: todo dia 10 por 5 meses = 5 ocorrências), cada uma com seu próprio mini-ciclo de lembretes ancorado na data daquela ocorrência (Épico 6).
- [ ] **Modelagem (decidida):** o combinado segue sendo **um aviso** (uma linha em `avisos`, uma anotação de agenda) com uma tabela filha **`aviso_ocorrencias`** (uma linha por ocorrência: índice 1..N, data daquela ocorrência, status e confirmação próprios). O `status` do `aviso` **reflete a ocorrência corrente** (`programado`/`informado_pago`); o aviso só vira `pago` terminal na **última** ocorrência. Os `envios` ganham `ocorrencia_id` e o ciclo é gerado **por ocorrência** (lazy): ao confirmar a ocorrência k, o scheduler gera o mini-ciclo da k+1. Detalhe completo do schema no Épico 6 H6.10 (Decisões).
- [ ] A cada ocorrência: o devedor pode informar pagamento (`informado_pago`) e o cobrador confirma/rejeita, **sem** levar o combinado a terminal.
- [ ] Confirmar a ocorrência **k** (k < N) fecha **só aquela ocorrência**; o combinado volta a aguardar a **próxima** ocorrência (`programado`), mantendo o **mesmo horário reservado** (não vira `null` entre ocorrências).
- [ ] Só a confirmação da **última ocorrência** (ou o fim do período) leva o combinado a **`pago` terminal**; só aí o horário reservado vira `null`.
- [ ] O painel mostra o **progresso** do recorrente (ex.: "3 de 5 pagamentos confirmados") e o status da ocorrência corrente (Épico 9).
- [ ] Marcar como pago direto (H8.4) e reabrir (H8.6) valem **por ocorrência**.
- [ ] A própria recorrência (definir "todo dia 10 por 5 meses", por semana/mês ou datas específicas) é configurada na criação/ativação pelo **seletor de recorrência decidido no Épico 6 H6.10**; a lógica de confirmação por ocorrência descrita aqui se apoia nesse mecanismo.
- [ ] **Custo de crédito:** cada **ocorrência reserva 1 envio** na ativação (Épico 11 H11.4) e **consome de vez no disparo** do lembrete (charge-on-success, Épico 11 H11.5); confirmar como `pago` **não devolve** um envio já disparado. Recorrência **não é diferencial de plano** (é facilitador para registrar vários avisos do mesmo cliente); é só metrificada por ocorrência, como qualquer aviso.

---

### H8.8: Acompanhamento enquanto está em informado_pago 🟢
Como **cobrador**, quero ver os combinados em que o devedor diz que pagou mas eu ainda não confirmei, para não esquecer de fechar.
*Critérios de aceite:*
- [ ] Em `informado_pago`, o combinado **não dispara o ciclo normal**; a única mensagem possível é o **empurrãozinho de D+1** ao devedor, se eu ainda não confirmei (Épico 6 H6.5).
- [ ] `informado_pago` é **não-terminal**: enquanto eu não confirmar nem rejeitar, fica aguardando minha decisão (sem prazo automático para virar terminal).
- [ ] O combinado aparece destacado no painel como **"aguardando sua confirmação"** (detalhe no Épico 9), com **Confirmar** e **Rejeitar** à mão, e mostra **quando** o devedor informou.
- [ ] Nenhuma transição de `informado_pago` acontece sozinha por tempo: só **eu** (confirmando/rejeitando) ou as transições terminais legítimas (`cancelado`/`expirado`, fora deste épico).

---

### H8.9: Toda transição de pagamento é auditável e segura 🟢
Como **sistema (api)**, quero registrar e validar cada mudança de estado ligada a pagamento, para garantir histórico íntegro e transições válidas.
*Critérios de aceite:*
- [ ] Só são aceitas as transições válidas: `informado_pago → pago`, `informado_pago → programado` (`rejeitado_cobrador`), `programado → pago`, `pago → programado` (reabertura). Qualquer outra é rejeitada com envelope `{ error: { code, message } }`.
- [ ] **Defesa em profundidade / nenhuma regra de negócio no front:** o frontend só **exibe o que está no banco** e **solicita** a mudança; ele nunca altera o banco direto nem decide transição. O usuário pede a mudança → vai para a API → a API valida (e o **trigger do banco** valida de novo) → grava → o front relê e atualiza. *(Arquitetura recomendada; aberta a refino desde que continue idempotente e segura.)*
- [ ] Cada transição grava um evento em `eventos_aviso` (**append-only**, sem DELETE), com ator (cobrador/devedor/sistema), estado origem, estado destino e timestamp.
- [ ] Só **quem recebe** (cobrador, por conta ou pelo `telefone_cobrador`/telefone do profile) pode confirmar/rejeitar/marcar/reabrir; o devedor **não** confirma o próprio pagamento.
- [ ] Toda ação é **idempotente** (reprocessar o mesmo toque/clique não duplica efeito).
- [ ] **Nunca** logar telefone, Pix, valor sensível ou token; valor permanece em **centavos**, sem recálculo no cliente.

---

### Divergências com a definição atual

> A confirmação/rejeição e o estado `informado_pago` já existem em parte (CLAUDE.md descreve as transições e o evento `rejeitado_cobrador`). As divergências abaixo vêm das decisões das histórias.

- **`informado_pago` não dispara o ciclo:** CLAUDE.md/PROJETO.md dizem "não-terminal, lembretes continuam"; pela história os lembretes **param** (só o empurrãozinho de D+1). Mesma divergência do Épico 6 H6.5.
- **Renomear `pendente` → `programado`:** `informado_pago → pendente` e `pago → pendente` do CLAUDE.md viram `… → programado`. Mesma dívida de varredura no código/docs (README).
- **Combinados recorrentes (H8.7):** a máquina de estados atual não modela ocorrências múltiplas. **Decidido:** tabela filha **`aviso_ocorrencias`** ligada ao `aviso` (índice, data, status e confirmação por ocorrência) + `envios.ocorrencia_id`; o `status` do aviso reflete a ocorrência corrente e só vira terminal `pago` na última. Confirmar "por ocorrência" avança o ponteiro para a próxima ocorrência (volta a `programado`) e o scheduler gera o mini-ciclo dela (geração lazy). Schema completo no Épico 6 H6.10 (Decisões). Construção nova, em implementação nesta rodada.
- **Horário reservado: liberar só no fim + campo recuperável (H8.1/H8.6/H8.7):** o Épico 6 H6.9 dizia liberar (`null`) ao virar `pago`. Refinamento: em recorrentes o horário **só vira `null` no fim**; e em qualquer reabertura o horário **original** precisa ser guardado em um **campo recuperável** para ser **reusado igual** na reabertura, **fora** da regra de escolha de timestamp (aceitando colisão). H6.9 precisa desse campo extra (cross-ref atualizado no Épico 6).
- **Janela de reversão de 1 minuto na confirmação (H8.1/H8.6):** a mensagem de encerramento ao devedor atrasa ~1 min para o cobrador reverter; reabrir antes cancela a mensagem, reabrir depois manda uma 2ª mensagem de "status alterado". Lógica nova de agendamento de mensagem (paralela à do opt-out, Épico 7).
- **Confirmar/rejeitar por botão no WhatsApp para qualquer cobrador (H8.5):** não só cobrador sem conta. Precisa de notificação com botões (Confirmar / Ainda não recebi) e roteamento por telefone (profile ou `telefone_cobrador`). Hoje a confirmação é pensada só pelo painel.
- **Reengajamento pós-ciclo (H8.3):** mensagem manual do cobrador ("ainda não localizei o pagamento") com os 3 botões padrão, virando o último aviso do combinado, sem mudar de estado. Não existe hoje; cada reengajamento consome 1 envio do saldo (Épico 11), com cap técnico em H8.3.
- **Marcar/reabrir registram o ator:** o painel precisa distinguir devedor-informou x cobrador-marcou/confirmou (Épico 9).

### Decisões tomadas
- **Só o cobrador encerra:** o Whaviso nunca confirma sozinho; o devedor não confirma o próprio pagamento.
- **`pago` é terminal**, com única saída manual: reabertura `pago → programado` pelo cobrador (H8.6).
- **Rejeição volta para `programado`** (evento `rejeitado_cobrador`), retoma por catch-up, sem mexer no horário (que não foi liberado em `informado_pago`); mensagem ao devedor neutra e sem acusação.
- **Cobrador marca como pago direto** (`programado → pago`), sem depender do "Já paguei".
- **Qualquer cobrador confirma/rejeita por botão no WhatsApp** (não só quem não tem conta); quem tem conta também usa o painel.
- **Janela de 1 minuto** para o cobrador reverter antes de a mensagem ao devedor sair (confirmar/marcar pago); reabrir antes cancela a mensagem, reabrir depois gera mensagem de "status alterado".
- **Recorrência (modelagem decidida 2026-06-25):** confirmação **por ocorrência** via tabela filha **`aviso_ocorrencias`** (índice 1..N, data, status próprio); o aviso continua **uma linha/anotação**, com `status` refletindo a ocorrência corrente e **horário reservado compartilhado**; terminal `pago` e liberação do horário (`null`) só na **última** ocorrência. Marcar pago direto (H8.4) e reabrir (H8.6) agem na **ocorrência corrente**. Ciclo gerado **por ocorrência** (lazy, Épico 6 H6.10). Recorrência é **facilitador, não diferencial de plano**: cada ocorrência reserva 1 vaga de aviso ativo (Épico 11 H11.5).
- **Reuso de horário na reabertura:** horário original guardado em campo recuperável e reusado igual, fora da regra de timestamp.
- **Defesa em profundidade:** nenhuma regra de negócio no front; o front exibe o banco e solicita a mudança, a API + o trigger validam e gravam (aberto a refino mantendo idempotência/segurança).

### Decisões em aberto
- **Limite de reengajamentos manuais (H8.3):** até 3 por combinado, nunca dois no mesmo dia (cap técnico universal); cada reengajamento consome 1 envio do saldo (Épico 11).
- ~~**Modelagem da recorrência (H8.7)**~~ **resolvida (2026-06-25):** tabela `aviso_ocorrencias` + `envios.ocorrencia_id`, horário compartilhado, ciclo lazy por ocorrência, terminal só no fim. Schema no Épico 6 H6.10.

### Fora de escopo deste épico
- ❌ Texto, canal e janela das notificações ao cobrador (incl. cobrador sem conta) (Épico 10).
- ❌ Como `informado_pago`, `pago`, a fila de "aguardando confirmação" e o progresso do recorrente aparecem no painel (Épico 9).
- ❌ O empurrãozinho de D+1 e a parada do ciclo em `informado_pago` em si (Épico 6).
- ❌ O botão "Já paguei" do devedor que origina o `informado_pago` (Épico 7).
- ❌ Cadência/recorrência configurável em si (Épico 6 H6.10) e saldo/créditos de envio (Épico 11).
- ❌ Estados terminais `cancelado`/`expirado` e suas regras (Épicos 2/3 e 5).
