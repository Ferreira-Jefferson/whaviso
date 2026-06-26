# Épico 4: Modo agenda (cadastrar sem enviar e ativar depois)

> Nem todo combinado precisa virar mensagem. O Whaviso também serve como **agenda de cobrança/pagamento**: o criador cadastra o combinado **só para ele acompanhar**, sem que a outra ponta receba nada (nem convite, nem lembrete), e **decide depois** se e quando ativa o envio.
> Vale nos dois fluxos (receber e pagar invertido): o que muda é só quem seria convidado se ele resolver ativar.
> Diferença em relação a `aguardando_aceite`: ali o convite já existe e a intenção é mandar. No modo agenda **a intenção é não mandar** (ainda, ou nunca).
> **Estado:** `sem_aviso` (exibido como **"Sem aviso"**), combinado registrado só na agenda, do qual nenhum aviso sai.

---

### H4.1: Cadastrar um combinado em modo agenda 🟢
Como **criador (cobrador ou devedor)**, quero cadastrar um combinado sem enviar nada para a outra ponta, para usar o Whaviso como agenda particular sem incomodar ninguém.
*Critérios de aceite:*
- [ ] A escolha é feita pelos **botões de ação** no rodapé do formulário (sem seletor de modo à parte): **"Apenas salvar"** cria em modo agenda; **"Salvar e gerar convite"** já gera o convite. Os campos do combinado são os mesmos nos dois: muda só o que acontece ao confirmar.
- [ ] O combinado nasce no estado **`sem_aviso`**, **sem número de convite gerado** e **sem nenhum envio** programado.
- [ ] **Estado por ação (não confundir os dois):** "Apenas salvar" leva a **`sem_aviso`** (nada gerado, nada enviado); "Salvar e gerar convite" leva direto a **`aguardando_aceite`** (convite gerado, aguardando a outra ponta responder). Nos dois ainda não sai lembrete, mas em `aguardando_aceite` o convite já existe e a intenção é mandar. Um convite gerado e **não respondido não volta** para `sem_aviso`: segue em `aguardando_aceite` até aceite, recusa ou expiração (ver H4.3 e o épico de Convite & Aceite).
- [ ] A outra ponta (devedor ou cobrador convidado) **não recebe nada** e pode nem saber que o combinado existe.
- [ ] Os mesmos campos de negócio valem (nome da outra ponta, motivo, valor em centavos, data em America/Sao_Paulo).
- [ ] O **telefone da outra ponta é opcional** na agenda; só passa a ser obrigatório se eu quiser **ativar** o combinado (transformar em aviso, ver H4.3).
- [ ] Funciona tanto no fluxo **receber** quanto no **pagar invertido**.
- [ ] **Free também usa a agenda:** criar item de agenda é permitido no plano free (até o limite), porque nada é enviado; o que o free não pode é **ativar** (enviar), ver H4.3 e H1.5.
- [ ] A linguagem respeita as regras de ouro (sem "dívida/cobrança/atraso") e as convenções de mensagem (gênero neutro).

---

### H4.2: Acompanhar a agenda no painel 🟢
Como **criador**, quero ver e organizar meus combinados em modo agenda no painel, para acompanhar o que ainda não enviei.
*Critérios de aceite:*
- [ ] Os combinados em `sem_aviso` aparecem no painel claramente marcados como **"Sem aviso" / não enviados** (não se misturam com os que estão no ciclo ativo).
- [ ] Consigo **filtrar/separar** o que é agenda do que já está ativo.
- [ ] A partir da agenda consigo **editar** (H4.4), **ativar** (H4.3), **descartar** (H4.4) ou **marcar como pago** (H4.5) cada combinado.
- [ ] O layout detalhado do painel fica no épico do Painel (cross-ref).

---

### H4.3: Ativar um combinado da agenda 🟢
Como **criador**, quero pegar um combinado da agenda e ativar o envio, para passar a lembrar/convidar a outra ponta quando fizer sentido.
*Critérios de aceite:*
- [ ] A ação **ativar** gera o **número de convite** (H2.2/H3.2) e produz a mensagem pronta para compartilhar.
- [ ] Ao ativar, o combinado transita de **`sem_aviso` → `aguardando_aceite`** e segue o fluxo normal (Convite & Aceite, depois lembretes).
- [ ] Se faltar dado obrigatório para ativar (ex.: **telefone** da outra ponta, ou **Pix** no fluxo invertido), o sistema pede antes de ativar.
- [ ] Ativar **reserva créditos** (1 por ocorrência, charge-on-success, H11.4); manter a agenda é livre para todos (até o teto de agenda, H11.7), mas **ativar sem saldo** recusa com `saldo_insuficiente` e CTA de recarga (o item fica na agenda, não se perde).
- [ ] Antes de ativar, nada do ciclo de lembretes existe; depois de ativar, vale tudo do épico de lembretes.

---

### H4.4: Editar e descartar um combinado da agenda 🟢
Como **criador**, quero editar livremente ou descartar um combinado que está só na agenda, já que ninguém foi avisado dele ainda.
*Critérios de aceite:*
- [ ] Em `sem_aviso`, a **edição é livre e imediata**: como nada foi enviado e ninguém aceitou, **não há reaprovação** (diferente da H2.5).
- [ ] Posso **descartar** um combinado da agenda; como nada foi enviado, isso encerra o combinado sem notificar ninguém.
- [ ] Descartar respeita a regra de não-DELETE de negócio: o combinado vai para estado terminal (ex.: **cancelado**), não some do banco.
- [ ] A operação é registrada como evento (auditoria append-only).

---

### H4.5: Marcar como pago manualmente (agenda fechada sem envio) 🟢
Como **criador**, quero marcar como pago um combinado que ficou só na agenda, para fechar o acompanhamento mesmo sem nunca ter enviado nada.
*Critérios de aceite:*
- [ ] A partir de `sem_aviso`, consigo registrar manualmente que **foi pago** (transição `sem_aviso → pago`), sem nunca ter ativado o envio.
- [ ] **pago** é terminal: o combinado entra no histórico de recebidos/pagos.
- [ ] A confirmação de pagamento "normal" (com interação do devedor, `informado_pago`) fica no épico de Confirmação de pagamento; aqui é só o registro manual de quem usa a agenda.

---

### Divergências com a definição atual (já implementado)

> ✅ **Implementado.** Quando este épico foi escrito, toda criação gerava convite e seguia para `aguardando_aceite`. Hoje o modo agenda existe: "criar" e "gerar convite" estão separados, a criação pode nascer em `sem_aviso`, e a escolha na tela de criar é feita pelos botões de ação ("Apenas salvar" x "Salvar e gerar convite"), sem seletor de modo à parte. Os pontos abaixo ficam como registro do que foi construído.

- **Estado novo `sem_aviso`** (modo agenda): anterior ao convite. Transições a acrescentar na máquina de estados: `sem_aviso → aguardando_aceite` (ativar), `sem_aviso → cancelado` (descartar) e `sem_aviso → pago` (registro manual da H4.5). Em `sem_aviso`, **nenhum** envio/lembrete é programado.
- **Criação sem convite:** hoje criar já gera o número/convite. Precisa separar "criar" de "gerar convite": o convite só nasce ao **ativar** (H4.3).
- **Free cria item de agenda:** hoje o free não cria nada (H1.5/H2.3 = só visualizar). Passa a poder **manter agenda** (sem envio), mas continua sem poder **ativar**. Distinguir "criar agenda" de "ativar/enviar": criar/manter anotação é livre (até o teto de agenda, H11.7); só **ativar** reserva/consome crédito.
- **Painel com a agenda:** o painel passa a ter uma faixa/filtro de "Sem aviso", a modelar no épico do Painel.

### Decisões tomadas
- **Nome do estado:** `sem_aviso`, exibido como **"Sem aviso"**. Escolhido por dizer exatamente o que é: um combinado do qual nenhum aviso é enviado.
- **Limite da agenda (balde único, H11.7):** a agenda tem um **teto por conta**, em **2 estados**: modesto enquanto a conta nunca comprou crédito, generoso após a 1ª compra (valores no catálogo de créditos do Épico 11; iniciais: 25 sem compra, 1000 após a 1ª compra). Não há mais limite por plano nem "vagas de aviso ativo" (o modelo de 4 planos foi revogado): criar anotação é livre até o teto; o que limita **enviar** é o **saldo de créditos** (cada ocorrência custa 1 envio).
- **H4.5 no MVP:** sim. A agenda já nasce **completa e usável**, incluindo marcar como pago manualmente.

### Fora de escopo deste épico
- ❌ Como o convite é validado e aceito no WhatsApp depois de ativar (épico de Convite & Aceite).
- ❌ Ciclo e textos dos lembretes (épico de Lembretes).
- ❌ Confirmação de pagamento com interação do devedor / `informado_pago` (épico de Confirmação de pagamento).
- ❌ Layout completo do painel e nomes/valores finais dos planos (épicos do Painel e de Planos).
