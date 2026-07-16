# Épico 3: Criar combinado (fluxo pagar invertido)

> Fluxo **pagar invertido**: quem cria é o **devedor** (vai pagar) e convida o **cobrador** (vai receber e confirma os dados, inclusive a chave Pix).
> É o espelho do Épico 2: mesma maquinaria de combinado/aceite, mesmas regras de edição/cancelamento/pausa, mas com os papéis trocados na criação.
> O combinado nasce em **aguardando_aceite** e **não dispara lembrete** até o cobrador confirmar (Épico 5).
> Quem recebe os lembretes continua sendo o **devedor** (a si mesmo): `telefone_devedor` é sempre o alvo dos lembretes; `telefone_cobrador` é o alvo do combinado (o envio inicial) neste fluxo.
> Convenções de sempre: dinheiro em **centavos** (int), datas em **America/Sao_Paulo**.

---

### H3.1: Cadastrar um combinado a pagar 🟢
Como **devedor**, quero cadastrar um combinado que eu vou pagar e convidar quem vai receber, para ser lembrado dos meus compromissos antes de vencerem.
*Critérios de aceite:*
- [ ] Informo: **nome de quem recebe** (cobrador), **motivo**, os **itens do pedido** (mesma regra da H2.8), **data combinada**, **telefone do cobrador** (alvo do combinado).
- [ ] O **valor não é digitado à parte**: é **derivado da soma dos itens** (calculado pelo servidor, exibido em leitura). Não há campo de valor avulso nem campo de custo (mesma regra da H2.1/H2.8). É preciso ao menos um item e o total maior que zero. O input de descrição do item tem autocomplete das descrições já usadas pelo criador.
- [ ] O **nome de quem paga** (devedor) é o do próprio criador (pré-preenchido a partir da conta).
- [ ] Posso informar a **chave Pix** de quem recebe (para onde vou pagar), mas ela é **opcional** no fluxo invertido: o devedor nem sempre conhece a chave de quem vai receber. Se eu informar, ela vai no combinado para o cobrador **conferir e confirmar** (ou apontar como incorreta), ver H3.3, e o cobrador valida/ajusta o **nome do titular** e o **banco** (usados na resposta de Pix ao devedor, Épico 7 H7.3). Se eu **não** informar, o combinado nasce sem chave e o **cobrador informa a própria chave depois**, de forma guiada (Épico 14).
- [ ] O combinado nasce com `criador_papel = devedor` e **sem cobrador vinculado** (`cobrador_id` nulo); o cobrador entra denormalizado por `nome_cobrador` / `telefone_cobrador`.
- [ ] O valor é exibido em reais, mas persiste em **centavos** (int).
- [ ] A data é interpretada em **America/Sao_Paulo**; o banco guarda em UTC.
- [ ] Campos obrigatórios validados com mensagem clara; ao menos um item e total maior que zero.
- [ ] Ao salvar, o combinado é criado no estado **aguardando_aceite**.
- [ ] A linguagem respeita as regras de ouro (sem "dívida/cobrança/atraso").

---

### H3.2: Enviar o combinado ao cobrador pelo WhatsApp 🟢
Como **devedor**, quero que o combinado seja enviado direto ao WhatsApp do cobrador, para ele conferir os dados, confirmar a chave Pix e responder com um toque.
*Critérios de aceite:*
- [ ] Vale a **mesma mecânica da H2.2**, mas o combinado é enviado ao **cobrador** (não ao devedor).
- [ ] Ao criar/ativar no modo enviar, o combinado nasce em **`aguardando_aceite`** e o Whaviso envia o **resumo + botões** direto ao WhatsApp do cobrador (Meta Cloud API).
- [ ] O resumo traz os dados do combinado **e a chave Pix** (quando informada) para o cobrador conferir, com os botões de resposta (Épico 5).
- [ ] O combinado é localizado pelo próprio envio (o `aviso_id` viaja no payload do botão), não por número que o cobrador precise digitar.
- [ ] Enquanto o cobrador não responde, **nenhum lembrete** é enviado ao devedor.

---

### H3.3: Cobrador confere os dados e a chave Pix e responde com um toque 🟢
Como **cobrador convidado**, quero conferir o combinado (inclusive a chave Pix) e responder com um botão, para confirmar, apontar erro ou recusar sem complicação.
*Critérios de aceite:*
- [ ] A mensagem do combinado mostra os dados **e a chave Pix** para o cobrador conferir.
- [ ] O cobrador responde por **botão** (nomes finalizados no Épico 5; ideias: **Aceitar / tudo certo**, **Chave Pix incorreta**, **Recusar combinado**).
- [ ] **Aceitar:** o combinado sai de `aguardando_aceite` para `programado` e o ciclo de lembretes ao **devedor** é ativado (Épico 6).
- [ ] **Chave Pix incorreta:** o combinado **não** é aceito nem recusado; é só um sinal de "algum dado incorreto" (sem texto livre). O **devedor é notificado** para revisar e reenviar; o cobrador vê uma resposta neutra, ex.: *"Certo, vamos comunicar sua resposta."*
- [ ] **Recusar combinado:** o combinado vai para o terminal **`recusado`** (estado próprio da recusa, distinto de `cancelado`, ver Épico 5) e o **devedor é notificado**.
- [ ] **Em qualquer resposta, o devedor que convidou é notificado.**
- [ ] Se o cobrador **já tem conta** com aquele telefone, fica vinculado pelo `profile.id`; se não, fica **só pelo telefone** (`telefone_cobrador`), com CTA discreta de criar conta.
- [ ] Enquanto o cobrador não responde, **nenhum lembrete** é enviado ao devedor.
- [ ] Os botões e textos canônicos ficam no Épico 5.

---

### H3.4: Respeitar saldo e teto de agenda ao criar/ativar 🟢
Como **sistema (api)**, quero validar o **saldo de créditos** e o **teto de agenda** antes de criar/ativar o combinado invertido, para impedir uso além do disponível.
*Critérios de aceite:*
- [ ] Vale a **mesma regra da H2.3**: criar é livre para todos (anotar na agenda é livre até o teto, H11.7); **ativar/enviar** exige **saldo de créditos** (reserva na ativação, H11.4); checagem na **API**. Não há mais "vagas de aviso ativo" por plano (modelo de 4 planos revogado).
- [ ] Para o **teto de agenda** (balde único, H11.7), toda anotação **não-arquivada** conta (inclusive terminal); só o arquivamento libera espaço.
- [ ] O limite considera os combinados onde sou o **criador**, independente do papel (receber ou pagar).

---

### H3.5: Editar, cancelar e pausar (mesmas regras do Épico 2) 🟢
Como **devedor criador**, quero editar, cancelar ou pausar o combinado que criei, com as mesmas garantias do fluxo receber.
*Critérios de aceite:*
- [ ] **Edição, cancelamento e pausa** seguem exatamente as histórias **H2.5, H2.6 e H2.7**, com os papéis trocados: quem é notificado das mudanças é o **cobrador** convidado (e, quando aceito, segue valendo a reaprovação).
- [ ] Editar depois do aceite leva a **aguardando_aprovacao_aviso_editado**, com lembretes pausados, e a reaprovação é feita pelo **cobrador** (quem confirmou).
- [ ] Cancelar é possível em qualquer fase **viva**; se já aceito, o **cobrador** é notificado; **cancelado** é terminal e nada é apagado.
- [ ] Pausar/reativar só a partir de **aceito**; o **devedor** continua sendo quem deixa ou volta a receber lembretes (é o alvo), e o **cobrador** é notificado da pausa/reativação.
- [ ] Todas as alterações são registradas como evento (auditoria append-only).

---

### Divergências com a definição atual

> A maioria deste épico **já existe** (migration `0017`): `cobrador_id` nullable, `criador_papel`, `nome_cobrador`/`telefone_cobrador`, aceite genérico por papel, painel por papel, CTA de criar conta. Ver memória `whaviso-pagar-invertido`.

- **Envio direto do combinado (em vez de token/link):** mesma divergência da H2.2, agora ao **telefone do cobrador**. Hoje o combinado é compartilhado por link `wa.me` + página pública; passa a ser enviado direto ao WhatsApp do cobrador pela Meta Cloud API, com aceite por botão (Épico 5).
- **Novos estados** (`aguardando_aprovacao_aviso_editado`, `pausado`): mesma divergência do Épico 2, valem igual aqui.
- **Aceite via site:** a página pública `/aceite/:token` (que no invertido serve para o cobrador adicionar o Pix) entra na dívida técnica de **mover o aceite 100% para o WhatsApp** (ver README e Épico 5).
- **Quem informa o Pix muda:** hoje (migration `0017`) o **cobrador preenche** o Pix ao confirmar. Pela história, o **devedor informa** o Pix na criação (H3.1) e o cobrador só **confirma ou aponta como incorreto** por botão (H3.3). É refatoração.
- **`informado_pago` com cobrador sem conta:** quando o cobrador não tem conta (`cobrador_id` nulo), notificá-lo do pagamento informado depende de notificar por `telefone_cobrador` (hoje é por profile). Detalhar no Épico 8/10.
- **Backfill por telefone:** ao criar conta/salvar telefone, o sistema vincula combinados pelo número (`PATCH /perfil`). Hoje roda **sem verificação de posse** do número (risco aceito); quando houver verificação (OTP), condicionar o backfill a ela. Tratado no Épico 1/10, citado aqui por afetar o vínculo do cobrador convidado.

### Decisões tomadas
- **Pix opcional no combinado invertido (decisão revista):** o devedor pode criar/enviar o combinado ao cobrador **sem** a chave, porque nem sempre conhece a chave de quem vai receber (migration `0047`). Se informar, o cobrador confere e confirma ou aponta como incorreta (H3.3); se não informar, o cobrador **informa a própria chave depois**, de forma guiada (Épico 14).

### Fora de escopo deste épico
- ❌ Aceite/recusa pelo cobrador no WhatsApp (Épico 5).
- ❌ Disparo e textos dos lembretes ao devedor (Épico 6).
- ❌ Confirmação de pagamento e notificação ao cobrador (Épicos 7 e 9).
- ❌ Cadastro da chave pelo cobrador **depois** do aceite, quando o invertido nasce sem chave (Épico 14).
