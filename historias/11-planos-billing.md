# Épico 11: Créditos de envio e carteira (billing)

> O Whaviso é **pré-pago por crédito de envio**. Não há planos com recursos diferentes: **todo recurso é liberado para todos** (recorrência, cadência, menu de texto livre, confirmação de pagamento, totais, histórico). O que limita o uso é o **saldo de envios** da conta, nada mais.
> **Unidade = 1 envio = 1 ocorrência de aviso.** Um combinado simples vale 1 envio; um combinado recorrente de N ocorrências vale N envios (1 por ocorrência). O envio é a mesma unidade que, no futuro, custa dinheiro na Meta (1 mensagem de template entregue), então a conta revende exatamente a unidade que compra.
> A conta nasce **Free** com um **saldo inicial de cortesia** (poucos envios) para experimentar. Sem saldo, a conta vira agenda: anota e visualiza, mas não dispara.
> **Comprar = escolher a quantidade num seletor (slider) e pagar.** O preço total segue uma **curva**: o R$/envio cai conforme a quantidade sobe. O saldo comprado é **aditivo** (10 que sobraram + 25 comprados = 35) e **nunca expira** (regra de confiança: o que a pessoa pagou não se perde).
> **Cobra só o que foi de fato usado (charge-on-success).** Ativar um aviso **reserva** o crédito; o crédito só é **consumido de vez quando o lembrete dispara**. Convite **não aceito** (recusado/expirado) **devolve** o crédito. Opt-out/cancelamento no meio de um recorrente põe os envios não disparados em **hold de 24h** e depois devolve ao saldo, com aviso claro à pessoa.
> No MVP **não há gateway**: a compra de crédito é **manual** (a pessoa fala no WhatsApp, paga via Pix, e o **owner credita** os envios na conta). Gateway de pagamento e recarga automática/assinatura mensal são **futuro** (🟡).
> **Não há cliente em produção ainda:** o schema e as regras são feitos do zero, sem compatibilidade com o modelo antigo de 4 planos (Free/Start/Profissional/Plus), que fica revogado (ver Divergências).

---

### H11.1: Carteira de créditos e saldo 🟢
Como **sistema**, quero que cada conta tenha uma carteira de créditos de envio, para controlar o que a conta pode disparar com base no saldo, e não em planos.
*Critérios de aceite:*
- [ ] Cada conta tem uma **carteira** com quatro grandezas derivadas de um livro-razão (append-only, regra de não-DELETE):
  - **saldo livre**: créditos prontos para usar.
  - **reservado**: créditos presos a avisos ativos ainda não disparados.
  - **em hold**: créditos a caminho de volta (janela de 24h após opt-out/cancelamento, H11.6).
  - **consumido**: créditos já disparados (permanente, nunca voltam).
- [ ] A conta nasce **Free** com um **saldo inicial de cortesia** (valor pequeno, parametrizável; sugestão inicial: poucos envios) para experimentar de ponta a ponta.
- [ ] O saldo comprado **não expira**. O saldo inicial de cortesia também não expira (é só pequeno).
- [ ] Toda mudança de saldo é um **lançamento no livro-razão** (compra, crédito do owner, reserva, consumo, devolução, hold), com tipo, quantidade, referência (aviso/ocorrência ou pagamento) e timestamp. A carteira é a soma dos lançamentos (fonte única; nunca um número solto editável à mão).

---

### H11.2: Tudo liberado, sem trava de recurso 🟢
Como **pessoa usuária**, quero acesso a todos os recursos desde o Free, para o limite ser só quanto eu envio, não o que eu posso usar.
*Critérios de aceite:*
- [ ] **Recorrência, cadência configurável, menu de texto livre, confirmação de pagamento (`informado_pago`), totais por período e histórico completo** estão disponíveis para **todas as contas**. Não há recurso "só de pago".
- [ ] O único limite é o **saldo de envios**: sem saldo, a conta anota na agenda e visualiza o painel, mas **não ativa nem dispara** (ver H11.4).
- [ ] A recorrência é, de propósito, um **acelerador de consumo** (cada ocorrência é 1 envio): por isso é livre para todos (bom para o usuário e para a empresa), nunca um diferencial pago.
- [ ] Some o conceito de **alavanca por plano**: o catálogo não tem mais colunas de "cadência sim/não", "menu sim/não" etc. (ver Divergências; refatorar `alavancas_do_plano`).

---

### H11.3: Comprar créditos por quantidade (slider + curva) 🟢
Como **pessoa usuária**, quero escolher exatamente quantos créditos comprar num seletor de quantidade, para pagar pelo que preciso (não "ou 10 ou 100").
*Critérios de aceite:*
- [ ] A compra é por **quantidade livre** num **seletor (slider/range)**, de um **mínimo** a um **máximo** parametrizáveis (sugestão inicial: de 10 a 500 envios). Não há pacotes fixos como produtos separados.
- [ ] O **preço total** segue uma **curva**: o R$/envio **cai** conforme a quantidade sobe. O total é **interpolado** entre o total no piso (quantidade mínima) e o total no topo (quantidade máxima); o cálculo é uma **função única** (espelhada front/back, fonte única do preço), a mesma ideia da antiga curva do Plus.
- [ ] O preço (piso, topo, quantidades mín/máx) é **dado de catálogo** editável pelo owner em runtime (H11.11), não fixado em código.
- [ ] O seletor pode ter **marcas de atalho** (ex.: 25/50/100) só como conveniência visual; não são SKUs distintos.
- [ ] No MVP a compra é **manual** (sem gateway): o seletor leva à finalização **pelo WhatsApp** (a pessoa escolhe a quantidade, vê o preço, e é direcionada para pagar via Pix; o owner credita depois, H11.11). A mecânica de pagamento real é 🟡 (H11.13).
- [ ] Comprar **soma ao saldo** (aditivo); nunca substitui nem zera o que já existe.
- [ ] A linguagem respeita as Regras de Ouro (sem "dívida/cobrança/atraso", gênero neutro, sem travessão); vocabulário: **crédito, envio, saldo, recarga**.

---

### H11.4: Reserva na ativação (não ativa sem saldo) 🟢
Como **sistema**, quero reservar o crédito quando um aviso é ativado, para a conta nunca disparar além do que tem.
*Critérios de aceite:*
- [ ] **Ativar** um aviso (sai da agenda e entra no ciclo de envio) **reserva** créditos: **1** para combinado simples, **N** para recorrente de N ocorrências (1 por ocorrência).
- [ ] Ativar exige **saldo livre suficiente**. Sem saldo, a ativação é **recusada no servidor** com envelope `{ error: { code, message } }` e o front mostra a **CTA de comprar créditos** (H11.9), mantendo o item na agenda (nada se perde).
- [ ] A reserva **move** créditos de "saldo livre" para "reservado" (lançamento no livro-razão). Reservar **não** é consumir: o crédito ainda pode voltar (H11.5/H11.6).
- [ ] **Pausar** um aviso ativo **mantém a reserva** (ele segue vivo, só não dispara no momento). **Arquivar/tirar da agenda** um aviso ainda não disparado **devolve** a reserva.
- [ ] A validação é **no servidor**, na transação que ativa, sem janela de corrida que permita furar o saldo (H11.12).

---

### H11.5: Cobra só o que foi usado (charge-on-success) 🟢
Como **pessoa usuária**, quero pagar só pelos envios que de fato saíram para combinados aceitos, para não ser penalizada por marcar coisas que não viraram aviso.
*Critérios de aceite:*
- [ ] O crédito só é **consumido de vez** quando o **lembrete dispara** (a ocorrência entra no ciclo e a primeira mensagem é enviada). Consumido = sai de "reservado" para "consumido" (permanente).
- [ ] **Convite não aceito** (recusado ou expirado sem aceite) **não consome**: a reserva volta para "saldo livre" (devolução total). Só o que foi **aceito** chega a disparar e a ser cobrado.
- [ ] Depois de disparado, o envio **não volta** por nenhum motivo: cancelar, pausar, o devedor silenciar (`desregistrado`) ou marcar pago **não estornam** um envio já disparado. Enviou, foi.
- [ ] **Recorrente**: cada ocorrência é cobrada **no seu disparo**; ocorrências futuras ainda não disparadas seguem reservadas (e podem voltar por H11.6).
- [ ] Exemplo (deve valer): a pessoa marca 10 envios; 3 combinados **não** são aceitos; só os **7 aceitos** chegam a disparar e a ser cobrados; os 3 voltam ao saldo.

---

### H11.6: Devolução com hold de 24h 🟢
Como **pessoa usuária**, quero recuperar os envios que não chegaram a sair quando alguém pede para parar, mas com uma janela curta, para refletir uma possível volta antes de devolver.
*Critérios de aceite:*
- [ ] Quando um recorrente é interrompido no meio (a pessoa que recebe faz **opt-out**/`desregistrado`, ou o criador **cancela**), as ocorrências **ainda não disparadas** saem de "reservado" e entram em **hold por 24h**.
- [ ] Passadas as 24h **sem reativação**, os créditos em hold **voltam para o saldo livre** (lançamento de devolução).
- [ ] Se houver **reativação dentro das 24h** (a pessoa volta a receber, `desregistrado → programado`), os créditos saem do hold e **voltam para reservado** (seguem o ciclo normalmente), sem devolução.
- [ ] A pessoa usuária é **avisada com clareza** (in-app/notificação), com texto do tipo: *"[nome] pediu para parar os lembretes do combinado [combinado]. Foram enviados 2 de 5. Os 3 envios que não saíram voltam ao seu saldo em 24h, a menos que volte a receber."* (linguagem das Regras de Ouro: gênero neutro, sem "cobrança/dívida", sem travessão).
- [ ] Envios **já disparados** nunca entram em hold nem voltam (H11.5).
- [ ] O hold é resolvido por um **processo do servidor** (varredura/agendamento), não pelo cliente; idempotente (não devolve duas vezes).

---

### H11.7: Agenda (balde de anotações) 🟢
Como **sistema**, quero limitar quantas anotações uma conta mantém na agenda, para a agenda não virar depósito infinito, sem voltar a ter planos.
*Critérios de aceite:*
- [ ] A agenda é um **balde único**: toda anotação conta igual (ativa, pausada, só anotação `sem_aviso`, ou em estado terminal). O sistema **nunca remove sozinho**; só o usuário, por **arquivamento** (não DELETE físico).
- [ ] **Regra de 2 estados** (substitui capacidade por plano): a conta **Free que nunca comprou crédito** tem um **teto modesto** de anotações (anti-abuso, sugestão inicial: 25); a conta que **já comprou qualquer crédito** ganha agenda **generosa** (sugestão inicial: alta o suficiente para não incomodar, ex.: 1000, ou sem teto prático). *Decisão a confirmar/ajustar (ver Decisões em aberto).*
- [ ] Atingir o teto recusa criar nova anotação no servidor, com CTA (comprar créditos ou arquivar item encerrado), sem apagar nada.
- [ ] A contagem é **por conta** e validada no servidor (H11.12).

---

### H11.8: Saldo visível e transparência 🟢
Como **pessoa usuária**, quero ver meu saldo e o que está reservado/em hold em tempo real, para nunca ser pega de surpresa.
*Critérios de aceite:*
- [ ] A UI mostra, em tempo real (espelho do servidor, nunca recalculado no cliente): **saldo livre**, **reservado**, **em hold** e, se útil, **consumido no período**.
- [ ] Alerta de **saldo baixo** (ex.: faltam poucos envios) antes de a pessoa esbarrar no limite ao ativar.
- [ ] A pessoa consegue ver um **extrato** simples dos lançamentos (compra, crédito, reserva, consumo, devolução), para entender para onde foi cada envio (confiança = transparência).
- [ ] Nada de dado sensível em log (telefone/Pix/token; regra do Épico 13).

---

### H11.9: CTA de saldo insuficiente 🟢
Como **pessoa sem saldo para a ação**, quero ser avisada com clareza e levada à compra no momento do bloqueio, para entender o porquê e decidir comprar.
*Critérios de aceite:*
- [ ] Toda recusa por saldo (ativar sem crédito, agenda cheia no Free) mostra uma **CTA clara**: explica o limite e oferece **comprar créditos** (leva à tela de créditos, H11.10).
- [ ] A CTA **nunca** destrói trabalho: o item fica na agenda, os dados ficam salvos, nada é disparado.
- [ ] Linguagem das Regras de Ouro (sem "dívida/cobrança", gênero neutro, sem travessão), tom direto.

---

### H11.10: Tela de créditos do usuário 🟢
Como **pessoa usuária**, quero uma área "Créditos" onde vejo meu saldo e compro mais, para recarregar quando quiser.
*Critérios de aceite:*
- [ ] Há um item **"Créditos"** no menu do usuário (separado da Conta) que abre a tela.
- [ ] A tela mostra **saldo/reservado/em hold** (H11.8) e o **seletor de quantidade (slider)** com o **preço calculado ao vivo** conforme a quantidade (H11.3).
- [ ] A compra no MVP é **manual via WhatsApp**: ao escolher a quantidade, abre um **popup** com a quantidade e o preço e um **botão para finalizar no WhatsApp** (recebe o Pix por lá; o owner credita após o pagamento). O número fica em config (env), nunca hardcode.
- [ ] A tela nunca destrói saldo; comprar só **soma**.

---

### H11.11: Owner credita envios e edita a curva de preço 🟢
Como **owner**, quero creditar envios numa conta e ajustar o preço dos créditos pela tela de admin, para ativar quem pagou e ajustar a precificação sem migration.
*Critérios de aceite:*
- [ ] Na tela de admin de **Usuários**, o owner **credita uma quantidade de envios** numa conta (ativação manual pós-pagamento via WhatsApp). **Cada crédito exige confirmação** antes de aplicar no banco.
- [ ] Creditar é um **lançamento no livro-razão** (tipo "crédito do owner", com quantidade e quem creditou), **aditivo**, **append-only** (nunca apaga; estornar é outro lançamento negativo explícito, se um dia for preciso).
- [ ] Só o **owner** credita (authz `requireRole('owner')` no servidor); qualquer outra pessoa recebe recusa `{ error: { code, message } }`. O usuário **nunca** se credita (fecha a brecha de se dar saldo de graça).
- [ ] O owner edita a **curva de preço** dos créditos (piso, topo, quantidades mín/máx) pela tela de admin; validado no servidor (piso <= topo, mín <= máx, preço >= 0).
- [ ] O owner **não** mexe no saldo "na unha" fora do livro-razão (sem update direto que quebre a auditoria).

---

### H11.12: Validação no servidor (defesa em profundidade) 🟢
Como **sistema**, quero validar todo limite (saldo, reserva, agenda) na api e no banco, para o front nunca ser a fonte da verdade.
*Critérios de aceite:*
- [ ] O front **antecipa** (esconde/cinza botão, mostra saldo), mas a decisão final é **sempre** da api + banco.
- [ ] A reserva/consumo é feita na **transação** que ativa/dispara, com trava adequada (sem corrida que permita furar o saldo). *Ponto de teste dedicado.*
- [ ] Tentativa de burlar pelo front (chamar a api direto, ativar sem saldo, se autocreditar) é **recusada no servidor**.
- [ ] Os valores de preço/curva e o saldo vêm do **catálogo/livro-razão**, não fixados em código.

---

### H11.13: Recarga automática, assinatura e gateway 🟡
Como **owner**, quero, no futuro, recorrência sem parecer pegadinha, para ter receita previsível sem penalizar quem usa.
*Critérios de aceite:*
- [ ] 🟡 **Gateway de pagamento** (Pix automático/cartão) para a compra de crédito deixar de ser manual.
- [ ] 🟡 **Recarga automática** (auto-recharge): quando o saldo cai abaixo de X, recompra Y automaticamente (com aviso claro e teto, para não virar susto).
- [ ] 🟡 **Assinatura mensal opcional**: dá um **bônus mensal de envios + desconto** na curva. Regra de confiança: **só o bônus mensal reseta** (use-ou-perca); o **saldo comprado avulso nunca expira**. Nunca uma trava de recurso.
- [ ] 🟡 Tudo isso entra **depois** da carteira pré-paga manual (fase 1).

---

### Divergências com a definição anterior (revogadas)

> O modelo antigo deste épico (4 planos Free/Start/Profissional/Plus com alavancas por plano, versionamento e congelamento por assinatura) está **revogado**. Como **não há cliente em produção**, não há migração: o schema é refeito do zero para a carteira de créditos.

- **De 4 planos para Free + carteira:** caem `start`/`profissional`/`plus` como planos com recursos; entra a **carteira de créditos** e a **compra por quantidade** (slider).
- **Alavancas por plano caem:** `cadencia_configuravel`, `menu_texto_livre`, `informado_pago_habilitado`, `totais_periodo`, `permite_recorrente`, capacidade/vagas por plano deixam de existir como colunas de plano. Recursos são **universais** (H11.2). Refatorar/remover `alavancas_do_plano` e a tabela `planos`/`plano_versoes` para o modelo novo (catálogo passa a guardar só a **curva de preço dos créditos**).
- **Versionamento e congelamento por assinatura (antigas H11.11/H11.12) caem:** não há plano por assinatura para congelar; o que existe é **saldo comprado** (que por natureza não muda retroativamente). O catálogo guarda só preço de crédito, editável pelo owner.
- **`vagas de aviso ativo` (slot concorrente, liberado no pagamento) caem:** o conceito vira **crédito consumível** (reserva na ativação, consumo no disparo, sem retorno após disparo). É o oposto do modelo antigo (que liberava a vaga quando o aviso era confirmado pago). Refatorar `somarVagasAtivas` e tudo que contava vagas.
- **Capacidade de agenda por plano cai:** vira a **regra de 2 estados** (Free modesto / generosa após 1ª compra), H11.7.
- **Ajustes em outros épicos:** referências a "recurso só de pago" viram "disponível para todos": **cadência** (Épico 6), **menu de texto livre** (Épico 7 H7.1), **confirmação `informado_pago`** (Épico 8). A **CTA de upgrade** vira **CTA de comprar créditos**.

### Decisões tomadas
- **Modelo = carteira de créditos pré-paga.** Free + compra de envios; sem planos com recursos.
- **Unidade = 1 envio = 1 ocorrência de aviso** (simples = 1; recorrente de N = N).
- **Tudo liberado para todos;** o limite é só o saldo (H11.2). Recorrência é livre (acelera consumo, bom para os dois lados).
- **Compra por quantidade livre (slider) com curva de preço** (R$/envio cai com o volume); preço editável pelo owner (H11.3/H11.11).
- **Saldo aditivo e que não expira** (regra de confiança: o pago não se perde).
- **Charge-on-success:** reserva na ativação, consumo no disparo, devolução do não aceito; envio disparado nunca volta (H11.4/H11.5).
- **Hold de 24h** na interrupção de recorrente, com aviso claro (H11.6).
- **Saldo/reservado/em hold visíveis em tempo real** + extrato (H11.8).
- **Owner credita (com confirmação) e edita a curva;** usuário nunca se credita (H11.11).
- **Sem cliente em produção:** schema do zero, sem compatibilidade com o modelo de 4 planos (revogado).
- **MVP manual:** compra via WhatsApp + crédito do owner; gateway/recarga/assinatura são 🟡 (H11.13).

### Decisões em aberto
- **Valores iniciais a calibrar:** saldo de cortesia do Free; teto de agenda do Free e da conta com crédito; mínimo/máximo do slider; piso/topo da curva de preço.
- **Confirmar a regra de agenda** (2 estados como proposto, ou agenda generosa para todos desde o Free).

### Fora de escopo deste épico
- ❌ Gateway de pagamento, recarga automática, assinatura mensal, dunning (🟡, H11.13).
- ❌ Textos finais das CTAs e da tela de créditos (entram com Templates/design).
- ❌ Mecânica de cada recurso em si (recorrência, cadência, menu): definida nos Épicos 6, 7 e 8; aqui só o fato de serem universais e de cada ocorrência custar 1 envio.
- ❌ Limites operacionais do canal WhatsApp/Baileys (capacidade de envio): restrição de transporte (Épico 10), não regra de crédito.
