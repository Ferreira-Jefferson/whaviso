# Épico 2: Criar combinado (fluxo receber)

> Fluxo **receber**: quem cria é o **cobrador** (vai receber) e convida o **devedor** (vai pagar e recebe os lembretes).
> Ao criar, o combinado nasce em **aguardando_aceite** e **não dispara lembrete nenhum** até o aceite (Épico 5).
> Convenções que valem como regra: dinheiro em **centavos** (int), datas de negócio em **America/Sao_Paulo**.
> Identificação: o combinado é enviado direto ao WhatsApp do devedor (resumo + botões, via Meta Cloud API); não há token nem número de convite. Todo combinado tem um **código curto** (referência humana, não usado para localizar o envio). Ver H2.2 e a seção de divergências.

---

### H2.1: Cadastrar um combinado a receber 🟢
Como **cobrador**, quero cadastrar um combinado informando os dados do acordo, para automatizar os avisos ao devedor.
*Critérios de aceite:*
- [ ] Informo: **nome de quem paga** (devedor), **motivo**, os **itens do pedido** (ver H2.8), **data combinada**, **telefone do devedor** e a **chave Pix** (de quem recebe). A chave Pix é **obrigatória** (igual ao fluxo invertido): o botão "Chave Pix" aparece em toda mensagem, então todo combinado precisa de Pix.
- [ ] O **valor não é digitado à parte**: é **derivado da soma dos itens** do pedido (soma de quantidade x preço unitário), calculado pelo servidor e exibido em modo leitura. O formulário **não tem** campo de valor avulso.
- [ ] Junto da chave, informo o **nome do titular** e o **banco** da chave: eles compõem a 2ª mensagem enviada ao devedor quando ele pede o Pix (Épico 7 H7.3).
- [ ] O **nome de quem cobra** é o do próprio cobrador (pré-preenchido a partir da conta).
- [ ] O valor é exibido em reais na UI, mas persiste em **centavos** (int) no banco.
- [ ] A data é interpretada em **America/Sao_Paulo**; o banco guarda em UTC.
- [ ] Campos obrigatórios validados com mensagem clara; é preciso **ao menos um item** e o **total precisa ser maior que zero**.
- [ ] **Não há campo de custo** do produto no formulário (o dono acompanha só o preço de venda). Custo por item pode virar uma feature futura, se solicitado.
- [ ] Ao salvar, o combinado é criado no estado **aguardando_aceite**.
- [ ] A linguagem de toda a tela respeita as regras de ouro (sem "dívida/cobrança/atraso").

---

### H2.2: Enviar o combinado ao devedor pelo WhatsApp 🟢
Como **cobrador**, quero que o combinado seja enviado direto ao WhatsApp do devedor logo após criar/ativar, para ele conferir o acordo e responder com um toque.
*Critérios de aceite:*
- [ ] Ao criar/ativar no modo enviar, o combinado nasce em **`aguardando_aceite`** e o Whaviso envia o **resumo do combinado + botões** direto ao WhatsApp do devedor (Meta Cloud API), sem depender de o cobrador repassar link ou número.
- [ ] O resumo traz os dados do acordo (motivo, valor em reais, data em `America/Sao_Paulo`) e os botões de aceite (aceitar / algum dado incorreto / recusar), detalhados no Épico 5.
- [ ] O combinado é localizado pelo próprio envio (o `aviso_id` viaja no payload do botão), não por número que o devedor precise digitar.
- [ ] Todo combinado ganha, ao ser criado, um **código curto** para referência humana entre cobrador e devedor (ex.: mencionar "o combinado XXXXXX" numa conversa): **6 caracteres alfanuméricos, maiúsculos**, excluindo os caracteres ambíguos (**0/O, 1/I/L**), gerado com **aleatoriedade criptográfica** e **não sequencial** (não revela quantos combinados já existem). O código **não serve para localizar** o envio nem substitui o botão de resposta (isso continua pelo `aviso_id` do payload); é só um rótulo legível.
- [ ] Enquanto o devedor não responde, **nenhum lembrete** é programado nem disparado.
- [ ] O detalhamento do aceite em si (botões, respostas, expiração) fica no Épico 5.

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
- [ ] No aceite, em vez de aceitar ou recusar, o devedor pode sinalizar **"algum dado está incorreto"** (sem texto livre): isso **não aceita nem recusa**, só **notifica o cobrador** para revisar. O devedor vê uma resposta neutra (*"Certo, vamos comunicar sua resposta."*) e o cobrador edita e reenvia o combinado (como ainda não houve aceite, a edição é livre, sem `aguardando_aprovacao_aviso_editado`). Detalhe no Épico 5.
- [ ] Toda alteração (edição, desfazer, aprovação, recusa, pedido de ajuste) é registrada como evento (auditoria append-only).
- [ ] A **quantidade de edições/reedições** permitidas é **universal** (não varia por plano; o modelo é carteira de créditos, H11.2).
- [ ] Como o valor é **derivado dos itens** (H2.1/H2.8), a edição dos **itens** também é editável a qualquer momento. Se a edição dos itens **altera o total**, ela é tratada como mudança do **acordo** (mesmo caminho do valor: livre antes do aceite; reaprovação depois do aceite). Se os itens mudam mas o **total permanece igual** (ex.: corrigir uma descrição), é edição **interna livre** (não reabre aprovação, não vai ao devedor).

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

### H2.8: Montar o pedido por itens (base do valor) 🟢
Como **cobrador (revendedor)**, quero montar o combinado listando os **itens do pedido**, para que o valor seja a soma do que foi vendido, sem eu ter que somar na mão.
*Critérios de aceite:*
- [ ] O combinado tem uma lista de **itens do pedido**, cada item com **descrição**, **quantidade** e **preço unitário** (centavos, >= 0).
- [ ] A lista é **obrigatória**: pelo menos **um item**. O formulário já nasce com **uma linha** aberta.
- [ ] O **valor do combinado é a soma** dos itens (quantidade x preço unitário), calculada pelo servidor (autoridade). O total é exibido em modo leitura e é o valor que aparece no aceite e nas mensagens ao devedor.
- [ ] O **total precisa ser maior que zero** (não dá para salvar/enviar um pedido de valor zero).
- [ ] A **composição por item é interna** do dono: a outra pessoa vê **apenas o valor total**, nunca a lista de itens.
- [ ] Ao digitar a **descrição** de um item, o formulário sugere **produtos do catálogo** (Épico 17) e descrições já usadas; escolher um produto preenche a **descrição** e o **preço unitário** e grava o vínculo `produto_id`. Texto livre (sem produto) segue valendo, com `produto_id` vazio. O preço vindo do catálogo é ponto de partida (o valor do combinado é sempre o snapshot dos itens; editar o produto depois não recalcula este combinado, Épico 17 H17.3).
- [ ] Posso **cadastrar um produto novo inline** (Épico 17 H17.1) ali no montar do pedido, sem trocar de tela.
- [ ] **Não existe custo por item** nesta versão: o dono informa só o preço de venda. (Custo por item pode virar feature futura, se solicitado.)

---

### Divergências com a definição atual (precisam de refatoração)
> Como as histórias são a fonte de verdade, estes pontos significam que código/docs devem mudar para acompanhar.
- **Envio direto do combinado (em vez de token/link):** ao criar/ativar no modo enviar, o Whaviso envia o resumo + botões direto ao WhatsApp do devedor pela Meta Cloud API; não há mais token nem número de convite a gerar ou guardar. O aceite é por botão (Épico 5).
- **Novos estados na máquina de estados:** `aguardando_aprovacao_aviso_editado` (H2.5) e `pausado` (H2.7) não existem na máquina atual (PROJETO.md §4 / trigger no banco). Precisam entrar com suas transições válidas e efeito de "pausa de lembretes".
- **Edição abre um sub-ciclo** (editar → aguardando aprovação → aprovar/recusar/desfazer) que precisa ser modelado e testado com cuidado para não gerar estados inconsistentes.
- **Sinal de "algum dado incorreto" no aceite:** terceira opção no aceite (além de aceitar/recusar), **sem texto livre**, que só notifica o criador para revisar. Mantido simples de propósito (não coleta o que mudar) para reduzir complexidade e risco. **Não cria status novo**; reusa a edição-antes-do-aceite (livre). Precisa de mensagens novas (notificação ao criador + resposta neutra ao convidado). Modelar no Épico 5.

### Decisões tomadas
- **Pix obrigatório também no fluxo receber:** antes era opcional; passou a ser obrigatório porque o botão "Chave Pix" aparece em toda mensagem do ciclo (Épico 6). Vale nos dois fluxos.
- **Convidado sinaliza dado incorreto (simplificado):** no aceite há três opções, aceitar / **algum dado está incorreto** / recusar. O "dado incorreto" **não** coleta texto livre (decisão para reduzir complexidade e risco): apenas notifica o criador, que revisa e reenvia; o convidado recebe resposta neutra. Vale nos dois fluxos (no invertido a variante é "chave Pix incorreta"). Detalhado no Épico 5.


### Fora de escopo deste épico
- ❌ Aceite/recusa pelo devedor no WhatsApp (Épico 5).
- ❌ Disparo e textos dos lembretes (Épico 6).
- ❌ Fluxo invertido, criado pelo devedor (Épico 3).
