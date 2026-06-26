# Épico 2: Criar combinado (fluxo receber)

> Fluxo **receber**: quem cria é o **cobrador** (vai receber) e convida o **devedor** (vai pagar e recebe os lembretes).
> Ao criar, o combinado nasce em **aguardando_aceite** e **não dispara lembrete nenhum** até o aceite (Épico 5).
> Convenções que valem como regra: dinheiro em **centavos** (int), datas de negócio em **America/Sao_Paulo**.
> Identificação do convite: o devedor não recebe token; recebe um **número de convite de 6 dígitos** (formato `xxx-xxx`). Ver H2.2 e a seção de divergências.

---

### H2.1: Cadastrar um combinado a receber 🟢
Como **cobrador**, quero cadastrar um combinado informando os dados do acordo, para automatizar os avisos ao devedor.
*Critérios de aceite:*
- [ ] Informo: **nome de quem paga** (devedor), **motivo**, **valor**, **data combinada**, **telefone do devedor** e a **chave Pix** (de quem recebe). A chave Pix é **obrigatória** (igual ao fluxo invertido): o botão "Chave de Pag." aparece em toda mensagem, então todo combinado precisa de Pix.
- [ ] Junto da chave, informo o **nome do titular** e o **banco** da chave: eles compõem a 2ª mensagem enviada ao devedor quando ele pede o Pix (Épico 7 H7.3).
- [ ] O **nome de quem cobra** é o do próprio cobrador (pré-preenchido a partir da conta).
- [ ] O valor é exibido em reais na UI, mas persiste em **centavos** (int) no banco.
- [ ] A data é interpretada em **America/Sao_Paulo**; o banco guarda em UTC.
- [ ] Campos obrigatórios validados com mensagem clara; valor precisa ser maior que zero.
- [ ] Ao salvar, o combinado é criado no estado **aguardando_aceite**.
- [ ] A linguagem de toda a tela respeita as regras de ouro (sem "dívida/cobrança/atraso").

---

### H2.2: Gerar o convite (número de 6 dígitos + mensagem com link) 🟢
Como **cobrador**, quero receber uma mensagem pronta com número de convite e link logo após criar, para enviar ao devedor pelo WhatsApp e o Whaviso saber exatamente qual combinado é.
*Critérios de aceite:*
- [ ] Ao criar, o sistema gera um **número de convite de 6 dígitos**.
- [ ] **Exibição:** o número é mostrado como `xxx-xxx` (o hífen é só visual, para facilitar a leitura); na validação, o devedor pode digitar com hífen **ou** os 6 dígitos corridos, tanto faz.
- [ ] **Armazenamento:** no Aviso fica salvo apenas o **hash** do número; o valor em claro nunca é persistido (consistente com a regra de tokens só como hash).
- [ ] **Unicidade:** dois Avisos com o **mesmo telefone de devedor** não podem ter o mesmo número de convite (a geração garante isso).
- [ ] **Anti-brute-force:** no máximo **3 tentativas** de validação do número por devedor; ao estourar, novas tentativas são bloqueadas (definir efeito: bloqueio temporário ou exigir novo convite, ver Épico 5).
- [ ] O que o cobrador recebe para compartilhar é uma **mensagem completa**, não só um link: uma introdução + o **número de convite** + o **link**. Ex.: *"... Número de convite: xxx-xxx ... [link]"*.
- [ ] O **link** leva o devedor ao **WhatsApp do Whaviso** (não ao site), já com uma mensagem inicial pré-preenchida: *"Oi, aqui é [nome do devedor], meu convite é o xxx-xxx"*.
- [ ] **Validação no aceite:** o Whaviso localiza o combinado confrontando **número de convite + telefone** de quem está falando (ver Épico 5).
- [ ] **Fallback sem número:** se o devedor mandar mensagem sem o número (porque editou o texto), o Whaviso responde algo como *"Olá, qual o seu número de convite? Sem ele não consigo localizar o combinado."*
- [ ] A tela oferece forma fácil de **copiar/compartilhar** a mensagem inteira.
- [ ] O detalhamento do aceite em si fica no Épico 5.

---

### H2.3: Respeitar saldo e teto de agenda ao criar/ativar 🟢
Como **sistema (api)**, quero validar o **saldo de créditos** e o **teto de agenda** antes de criar/ativar, para impedir uso além do disponível.
*Critérios de aceite:*
- [ ] **Criar é livre para todos** (não há mais plano free travado): anotar na agenda (modo agenda) é livre até o **teto de agenda** da conta (balde único, H11.7); **ativar/enviar** exige **saldo de créditos** (reserva na ativação, H11.4). Sem saldo, a ativação recusa com erro `saldo_insuficiente` e CTA de recarga, sem destruir o trabalho (o item fica na agenda).
- [ ] **Não há "teto de vagas de aviso ativo" por plano** (modelo de 4 planos revogado): o limite de envios é o **saldo de créditos** (cada ocorrência reserva 1 envio, H11.4); o limite de anotações é o **teto de agenda** (H11.7). Ao faltar saldo ou estourar a agenda, a api recusa com `{ error: { code, message } }`.
- [ ] A checagem acontece na **API**, não só na UI.
- [ ] Para o **teto de agenda** (balde único, H11.7), toda anotação **não-arquivada** conta (inclusive em estado terminal); só o **arquivamento** libera espaço (nunca há remoção automática).

---

### H2.4: Não enviar nada antes do aceite 🟢
Como **devedor**, quero não receber lembrete nenhum enquanto eu não tiver aceitado, para não ser avisado de algo que ainda não confirmei.
*Critérios de aceite:*
- [ ] Em **aguardando_aceite**, nenhum envio de lembrete é programado nem disparado.
- [ ] O ciclo de lembretes (Épico 6) só é ativado após o aceite.

---

### H2.5: Editar um combinado (a qualquer momento, com reaprovação se já aceito) 🟢
Como **cobrador**, quero editar o combinado a qualquer momento, para corrigir ou ajustar o acordo, sabendo que se ele já foi aceito a mudança precisa ser reaprovada pelo devedor.
*Critérios de aceite:*
- [ ] A edição é possível em qualquer fase **viva** do Aviso (não só antes do aceite).
- [ ] **Antes do aceite** (em `aguardando_aceite`): a edição é aplicada direto, sem novo aceite.
- [ ] **Depois do aceite:** ao salvar a edição, o cobrador vê um aviso de confirmação: *"O Aviso editado precisa ser aprovado por [NOME_DEVEDOR]. Enquanto isso, as notificações deste combinado ficam pausadas. Deseja continuar?"*
- [ ] Ao confirmar, o Aviso entra no estado **aguardando_aprovacao_aviso_editado** e **os lembretes ficam pausados** até a decisão do devedor.
- [ ] O devedor recebe uma mensagem informando que houve uma alteração a aprovar e que os lembretes estão pausados até ele decidir.
- [ ] Enquanto está em `aguardando_aprovacao_aviso_editado`, o cobrador pode **desfazer a edição** a qualquer momento, voltando às condições anteriores.
- [ ] Se o devedor **aprovar** a edição, o combinado volta ao ciclo normal já com os novos dados.
- [ ] Se o devedor **recusar** a edição, o cobrador é notificado e pode escolher: **reativar nas condições anteriores** ou **reeditar**.
- [ ] No aceite, em vez de aceitar ou recusar, o devedor pode sinalizar **"algum dado está incorreto"** (sem texto livre): isso **não aceita nem recusa**, só **notifica o cobrador** para revisar. O devedor vê uma resposta neutra (*"Certo, vamos comunicar sua resposta."*) e o cobrador edita e reenvia o convite (como ainda não houve aceite, a edição é livre, sem `aguardando_aprovacao_aviso_editado`). Detalhe no Épico 5.
- [ ] Toda alteração (edição, desfazer, aprovação, recusa, pedido de ajuste) é registrada como evento (auditoria append-only).
- [ ] A **quantidade de edições/reedições** permitidas é **universal** (não varia por plano; o modelo é carteira de créditos, H11.2).

---

### H2.6: Cancelar um combinado 🟢
Como **cobrador**, quero cancelar um combinado, para encerrá-lo quando não faz mais sentido.
*Critérios de aceite:*
- [ ] O cancelamento é possível em qualquer fase **viva** do Aviso (aguardando ou aceito).
- [ ] Se o combinado já tinha sido **aceito**, o devedor é **notificado** do cancelamento.
- [ ] **cancelado** é estado terminal: nunca mais envia nada.
- [ ] O combinado não é apagado do banco (regra: estados, não DELETE); fica registrado como cancelado.
- [ ] O evento de cancelamento é gravado na auditoria.

---

### H2.7: Pausar e reativar um combinado aceito 🟢
Como **cobrador**, quero pausar temporariamente um combinado já aceito, para suspender os lembretes sem cancelar o acordo, e reativar quando quiser.
*Critérios de aceite:*
- [ ] O estado **pausado** só existe a partir de um combinado **aceito**.
- [ ] Ao pausar, o devedor recebe uma mensagem, ex.: *"Olá [nome], [cobrador] pausou o Aviso do combinado: [motivo]. Até ser reativado, você não receberá novos lembretes deste combinado."*
- [ ] Em **pausado**, nenhum lembrete é enviado.
- [ ] Ao **reativar**, o devedor também é notificado e o ciclo de lembretes volta a valer.
- [ ] **pausado** não é terminal: o combinado continua vivo e pode voltar a `programado`, ser cancelado, etc.
- [ ] Pausa/reativação são registradas como eventos (auditoria).

---

### Divergências com a definição atual (precisam de refatoração)
> Como as histórias são a fonte de verdade, estes pontos significam que código/docs devem mudar para acompanhar.
- **Número de convite de 6 dígitos:** substitui a ideia de enviar token ao usuário. O `aviso` precisa guardar esse número (com unicidade por telefone de devedor). Reavaliar como ficam os tokens/hash sha256 documentados no CLAUDE.md (podem continuar para outros usos, mas o convite ao devedor passa a ser o número).
- **Novos estados na máquina de estados:** `aguardando_aprovacao_aviso_editado` (H2.5) e `pausado` (H2.7) não existem na máquina atual (PROJETO.md §4 / trigger no banco). Precisam entrar com suas transições válidas e efeito de "pausa de lembretes".
- **Edição abre um sub-ciclo** (editar → aguardando aprovação → aprovar/recusar/desfazer) que precisa ser modelado e testado com cuidado para não gerar estados inconsistentes.
- **Sinal de "algum dado incorreto" no aceite:** terceira opção no aceite (além de aceitar/recusar), **sem texto livre**, que só notifica o criador para revisar. Mantido simples de propósito (não coleta o que mudar) para reduzir complexidade e risco. **Não cria status novo**; reusa a edição-antes-do-aceite (livre). Precisa de mensagens novas (notificação ao criador + resposta neutra ao convidado). Modelar no Épico 5.

### Decisões tomadas
- **Pix obrigatório também no fluxo receber:** antes era opcional; passou a ser obrigatório porque o botão "Chave de Pag." aparece em toda mensagem do ciclo (Épico 6). Vale nos dois fluxos.
- **Armazenamento do número de convite:** guardado como **hash**; exibido como `xxx-xxx` (hífen só visual); validação aceita 6 dígitos corridos ou com hífen. Limite de **3 tentativas** de validação.
- **Convidado sinaliza dado incorreto (simplificado):** no aceite há três opções, aceitar / **algum dado está incorreto** / recusar. O "dado incorreto" **não** coleta texto livre (decisão para reduzir complexidade e risco): apenas notifica o criador, que revisa e reenvia; o convidado recebe resposta neutra. Vale nos dois fluxos (no invertido a variante é "chave Pix incorreta"). Detalhado no Épico 5.


### Fora de escopo deste épico
- ❌ Aceite/recusa e como o número de convite é validado no WhatsApp (Épico 5).
- ❌ Disparo e textos dos lembretes (Épico 6).
- ❌ Fluxo invertido, criado pelo devedor (Épico 3).
