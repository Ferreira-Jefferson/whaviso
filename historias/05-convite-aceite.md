# Épico 5: Convite & Aceite pelo WhatsApp

> O aceite acontece **100% pelo WhatsApp**, sem site e sem login. É a regra de ouro: o convidado só interage por botões.
> **O Whaviso inicia a conversa:** assim que o combinado é criado (ou ativado, na agenda) no modo enviar, o Whaviso **manda o convite direto** para o WhatsApp do convidado, por template aprovado na Meta, com o resumo + os botões (H5.0). O convidado não precisa mais falar primeiro nem digitar número: só toca um botão. O caminho por **número de 6 dígitos** (H5.1) continua existindo como **reserva** (se a pessoa perder a mensagem, ou escrever antes de o convite chegar).
> Vale para os dois fluxos: no **receber** o convidado é o devedor; no **pagar invertido** o convidado é o cobrador (que confere a chave Pix, ou a informa depois quando o convite veio sem ela, Épico 14).
> O convite é identificado internamente por um **número de 6 dígitos** + **telefone** (Épicos 2 e 3), nunca por token exposto.
> Três respostas possíveis no aceite: **aceitar**, **algum dado está incorreto** (no invertido: **chave Pix incorreta**) e **recusar**. Em qualquer uma, **o criador é notificado**.
> Toda mensagem segue as convenções: gênero neutro, sem palavras proibidas, sem travessão (ver README).

---

### H5.0: O Whaviso envia o convite ao convidado 🟢
Como **sistema (api + zap)**, quero mandar o convite direto ao convidado assim que o combinado entra no modo enviar, para a pessoa receber o resumo e os botões sem precisar dar o primeiro passo.
*Critérios de aceite:*
- [ ] Ao **criar** (ou **ativar**, no modo agenda) um combinado no modo **enviar**, o combinado entra em `aguardando_aceite` e a **api enfileira um envio de convite ao convidado** (outbox `notificacoes_cobrador`, tipo `convite_enviar`), na **mesma transação** que cria/ativa o combinado.
- [ ] O **alvo é o convidado** (o não criador): no **receber** é o **devedor** (`telefone_devedor`); no **pagar invertido** é o **cobrador** (`telefone_cobrador`).
- [ ] O `zap` drena o envio e manda o **template aprovado** `convite.resumo` (variante `revisao` no invertido, com a chave Pix para conferir), com o resumo + os **3 botões** (aceitar / dado incorreto / recusar) carregando o `aviso_id` no payload.
- [ ] **Gate de template (E12):** enquanto o `convite.resumo` não estiver **aprovado na Meta**, o envio fica visível e recuperável (não some, não quebra) e sai assim que aprovar.
- [ ] **Idempotência:** um combinado gera **um** envio de convite (dedupe por combinado); recriar, editar antes do aceite ou reativar não duplica.
- [ ] Sem telefone do convidado não há envio (a ativação já exige o telefone da outra ponta antes, Épico 4).
- [ ] **Sem compartilhamento manual:** a api **não devolve mais** link `wa.me` nem mensagem pronta para o criador repassar (ver Divergências); o convite é sempre enviado pelo Whaviso. O `numero_convite` segue existindo como identificador de reserva (H5.1).
- [ ] Nada de telefone, Pix ou número de convite aparece em log.

---

### H5.1: Localizar o combinado pelo número de convite (reserva) 🟢
Como **convidado**, quero, **se precisar**, abrir a conversa com o Whaviso e ser reconhecido pelo número de convite, para chegar no combinado certo sem login mesmo quando o convite automático (H5.0) não chegou.
> Caminho **reserva**: o primário é H5.0 (o Whaviso envia direto). Este fluxo cobre quem perdeu a mensagem, escreveu antes de o convite chegar, ou recebeu o número por outro meio.
*Critérios de aceite:*
- [ ] Se o convidado **escreve ao Whaviso** com o número (ex.: *"Oi, aqui é [nome], meu convite é o xxx-xxx"*), o Whaviso reconhece o combinado sem login.
- [ ] O Whaviso **extrai o número de 6 dígitos** da mensagem, aceitando com hífen (`xxx-xxx`) ou os 6 dígitos corridos.
- [ ] O combinado é localizado confrontando **número de convite + telefone** de quem enviou (comparação contra o **hash** do número; o valor em claro nunca é persistido nem logado).
- [ ] **Fallback sem número:** se a mensagem não traz o número (texto editado), o Whaviso pede, ex.: *"Olá! Para localizar seu combinado, me envie o número de convite (6 dígitos). Sem ele não consigo encontrar."*
- [ ] **Número não existe:** se nenhum convite bate com o número, o Whaviso informa que não encontrou e conta a tentativa.
- [ ] **Número confere mas telefone não bate:** caso tratado à parte (provável erro de digitação do telefone por quem convidou), avisa as duas pontas, ver **H5.8**.
- [ ] **Anti-brute-force:** no máximo **3 tentativas** de número errado por telefone; ao estourar, o efeito depende de o telefone estar cadastrado ou não (ver **H5.9**).
- [ ] Nada de telefone, Pix ou número de convite aparece em log.

---

### H5.2: Ver o combinado e escolher a resposta 🟢
Como **convidado**, quero ver um resumo do combinado e responder por botão, para decidir com clareza e num toque.
*Critérios de aceite:*
- [ ] Localizado o combinado, o Whaviso responde com um **resumo**: quem cobra/quem paga, motivo, valor e data combinada.
- [ ] No fluxo **invertido**, o resumo inclui a **chave Pix** informada pelo devedor, para o cobrador conferir.
- [ ] A resposta traz **botões** (rótulos **editáveis pelo owner**, ver Épico 12; textos abaixo são o padrão):
  - **Aceitar** (fluxo receber e invertido);
  - **Algum dado está incorreto** (no invertido: **Chave Pix incorreta**);
  - **Recusar combinado**.
- [ ] O botão carrega o **`aviso_id`** no payload (não o número/token); o webhook é autenticado (HMAC).
- [ ] Como o Whaviso **inicia a conversa** (H5.0), a mensagem do resumo traz uma **sugestão gentil de salvar o contato do Whaviso** (para não perder as próximas mensagens), sem obrigar e em linguagem neutra.
- [ ] Linguagem neutra quanto a gênero e sem palavras proibidas.

---

### H5.3: Aceitar o combinado 🟢
Como **convidado**, quero aceitar com um toque, para começar a ser lembrado (ou, no invertido, confirmar que vou receber) sem precisar de conta.
*Critérios de aceite:*
- [ ] Ao tocar **Aceitar**, o combinado transita de **`aguardando_aceite` → `programado`** e o ciclo de lembretes (Épico 6) é ativado para o **devedor**.
- [ ] No fluxo **invertido**, aceitar **confirma a chave Pix** mostrada (passa a valer no combinado).
- [ ] **Vínculo:** sem sessão, o convidado fica vinculado **só pelo telefone**; com sessão ativa, vincula ao `profile.id`.
- [ ] **Conta criada automaticamente** (ver H1.4) com nome + telefone, no **plano free** (só visualização).
- [ ] O convidado recebe uma confirmação + **CTA discreta** para acompanhar no painel (nunca obrigatória).
- [ ] O **criador é notificado** do aceite (Épico 10).
- [ ] Resposta de confirmação em linguagem neutra.

---

### H5.4: Sinalizar que algum dado está incorreto 🟢
Como **convidado**, quero avisar que algo está errado sem precisar explicar, para o criador revisar sem eu ter que digitar nada.
*Critérios de aceite:*
- [ ] Ao tocar **Algum dado está incorreto** (invertido: **Chave Pix incorreta**), o combinado **não é aceito nem recusado** (continua em `aguardando_aceite`).
- [ ] **Sem texto livre:** o convidado não descreve o que mudar; é só um sinal.
- [ ] O **criador é notificado** para revisar e reenviar (edição antes do aceite é livre, sem `aguardando_aprovacao_aviso_editado`, ver H2.5).
- [ ] O convidado recebe resposta neutra, ex.: *"Certo, vamos comunicar sua resposta."*
- [ ] O evento é registrado (auditoria append-only).

---

### H5.5: Recusar o combinado 🟢
Como **convidado**, quero recusar com um toque, para encerrar o que não reconheço ou não concordo.
*Critérios de aceite:*
- [ ] Ao tocar **Recusar combinado**, o combinado transita de **`aguardando_aceite` → `recusado`** (evento `recusado`).
- [ ] **`recusado` é um estado próprio**, distinto de `cancelado`: **recusado** = o convidado recusou; **cancelado** = o criador cancelou um Aviso seu pelo sistema (H2.6/H3.5). São terminais diferentes para não confundir quem encerrou o combinado.
- [ ] **recusado** é terminal: nunca mais envia nada.
- [ ] O **criador é notificado** da recusa (Épico 10).
- [ ] O convidado recebe resposta neutra, ex.: *"Tudo bem, combinado recusado. Vamos avisar quem convidou."*
- [ ] O combinado não é apagado do banco (regra de estados, não DELETE).

---

### H5.6: Segurança e idempotência do aceite 🟢
Como **sistema (zap)**, quero processar o aceite com segurança e sem duplicar efeitos, para evitar fraude e estados inconsistentes.
*Critérios de aceite:*
- [ ] O webhook valida a autenticidade da mensagem (HMAC); payloads de botão levam `aviso_id`, nunca o número/token em claro.
- [ ] Estado **terminal** (`recusado`, `cancelado`, `pago`, `expirado`) **nunca reabre** nem reprocessa; um toque tardio recebe resposta informativa, não muda nada.
- [ ] O processamento é **idempotente**: tocar duas vezes no mesmo botão não duplica envios nem cria registros repetidos.
- [ ] Nunca logar telefone, Pix ou número de convite.

---

### H5.7: Convite expirado ou já respondido 🟢
Como **convidado**, quero entender quando o convite não vale mais, para saber que preciso de um novo.
*Critérios de aceite:*
- [ ] Um convite em `aguardando_aceite` **expira** (`aguardando_aceite → expirado`) após **7 dias** (prazo fixo, igual para todas as contas); depois disso não pode ser aceito.
- [ ] Convidado tentando responder um convite expirado recebe orientação para pedir um novo a quem convidou.
- [ ] Convidado tentando responder um combinado **já aceito** recebe aviso de que já está ativo (sem reprocessar).

---

### H5.8: Telefone não bate com o convite (provável erro de digitação) 🟢
Como **convidado e criador**, quero ser avisado quando o número de convite confere mas o telefone não, para entender que houve erro de digitação e que virá um convite ajustado.
*Critérios de aceite:*
- [ ] Quando o número de convite **existe** mas o **telefone de quem responde não bate** com o cadastrado, o Whaviso trata como provável **erro de digitação do telefone** por quem convidou (ou convite destinado a outra pessoa), não como número inválido.
- [ ] **Quem tentou acessar** recebe uma mensagem neutra, ex.: *"Provavelmente quem te convidou digitou seu WhatsApp errado, ou este convite era para outra pessoa. Vamos avisar quem convidou. Se o convite for para você, em breve chega um convite ajustado."*
- [ ] **Quem convidou (criador)** é notificado, ex.: *"O WhatsApp de quem tentou abrir este combinado não bate com o que você cadastrou. Confira o número e reenvie o convite."* (Épico 10).
- [ ] Não revela ao convidado nenhum dado do combinado (valor, motivo, Pix): só o aviso de que algo não bateu.
- [ ] Esse caso **não consome** as 3 tentativas como "número errado"; é tratado como divergência de telefone (efeito final junto das Decisões em aberto sobre tentativas).
- [ ] Nada de telefone, Pix ou número de convite aparece em log.

---

### H5.9: Esgotar as 3 tentativas de número errado 🟢
Como **sistema (zap)**, quero reagir quando alguém erra o número de validação 3 vezes, para destravar quem é o convidado certo e barrar quem não é.
*Critérios de aceite:*
- [ ] Conto **número errado** (número que não bate com nenhum convite, H5.1); telefone divergente (H5.8) **não** entra nessa conta.
- [ ] Ao **errar 3 vezes**, o Whaviso verifica se o **telefone de quem está respondendo já é alvo de um convite pendente** (`telefone_devedor`/`telefone_cobrador` em `aguardando_aceite`).
- [ ] **Telefone cadastrado** (existe convite pendente para ele): o Whaviso **gera um novo número de validação** (invalida o anterior) e **notifica quem convidou**, ex.: *"Quem recebeu o convite está com dificuldade para informar o número de validação. Acabei de gerar um novo, reenvie o convite e, se possível, dê uma mãozinha para a pessoa."* Quem tentou recebe orientação de aguardar o convite reenviado.
- [ ] **Telefone não cadastrado** (não há convite pendente para ele): o número fica **bloqueado** até que **um novo combinado seja enviado** para ele; recebe uma mensagem **diferente** (não revela combinado, não notifica criador algum, pois não há convite associado).
- [ ] **Sempre que falhar 3 vezes** (caso cadastrado), um **novo número de validação** é gerado; o número antigo deixa de valer.
- [ ] Nada de telefone, Pix ou número de convite aparece em log.

---

### Divergências com a definição atual (precisam de refatoração)

- **Auto-envio do convite (H5.0):** a `api` passa a enfileirar um envio ao convidado (`notificacoes_cobrador`, tipo `convite_enviar`) ao criar/ativar no modo enviar; o `zap` drena e manda o template `convite.resumo`. A api **deixa de devolver** `mensagem_convite` e `link_whatsapp`; a tela de sucesso passa a dizer que o convite foi enviado, e o `numero_convite` fica como reserva. O texto do `convite.resumo` é reescrito para soar como **primeira mensagem do Whaviso** e trazer a sugestão de salvar o contato (H5.2). Comportamento novo.
- **Remover aceite via site:** a página pública `/aceite/:token` e a rota `POST` pública de aceite saem do código; o aceite passa a ser 100% pelo WhatsApp (dívida técnica já registrada no README). No invertido, a coleta/confirmação do Pix migra do site para o fluxo do WhatsApp.
- **Estado `recusado` novo:** hoje a recusa cai em `cancelado` (migration `0017`). Passa a existir um terminal próprio **`recusado`** (convidado recusou), separado de `cancelado` (criador cancelou). Transição a acrescentar: `aguardando_aceite → recusado`. Refatoração da máquina de estados (vale também nos Épicos 2 e 3).
- **Validação por número de 6 dígitos + telefone** (em vez de token): o webhook precisa **extrair e validar o número** da mensagem inicial e contar tentativas (3). Comportamento novo.
- **Detecção de telefone divergente (H5.8):** o webhook precisa distinguir "número não existe" de "número existe mas telefone não bate" e, no segundo caso, notificar as duas pontas. Comportamento novo.
- **Esgotar 3 tentativas (H5.9):** contador de erros por telefone, distinção telefone cadastrado/não cadastrado, **regeneração do número de validação** e **bloqueio** de número desconhecido até novo combinado. Comportamento novo.
- **Rótulos de botão editáveis pelo owner:** os textos dos botões viram conteúdo configurável (tabela `templates`), não strings fixas. Detalhe no Épico 12.
- **Botão "algum dado incorreto":** hoje o webhook trata `aceite`/`recusa` (migration `0017`). A terceira opção é **nova**: novo payload, notificação ao criador e resposta neutra, **sem mudar o estado**.
- **Notificar o criador em toda resposta:** o aceite e a recusa já existem; falta garantir notificação ao criador também no "dado incorreto", e cobrir o caso de **cobrador sem conta** (notificar por `telefone_cobrador`, hoje é por profile, ver Épicos 3 e 10).
- **Conta criada no aceite + vínculo por telefone:** parte existe (vínculo por telefone na migration `0017`); falta garantir a criação automática de conta com nome + telefone no plano free (H1.4) e a CTA discreta.

### Decisões tomadas
- **Número como hash, 3 tentativas:** validação compara hash; claro nunca persistido nem logado.
- **Três respostas, sem texto livre:** aceitar / dado incorreto / recusar; "dado incorreto" só notifica o criador.
- **Criador sempre notificado** da resposta (aceite, dado incorreto, recusa).
- **Pix opcional no invertido** (Épico 3, decisão revista): se a chave veio no convite, o cobrador confirma ou aponta como incorreta; se o convite veio sem chave, o cobrador pode **informar a própria chave depois**, de forma guiada (Épico 14).
- **Linguagem neutra** quanto a gênero em todas as mensagens.
- **Recusa vira `recusado`** (não `cancelado`): terminal próprio para distinguir recusa do convidado de cancelamento pelo criador.
- **Whaviso inicia a conversa (decisão revista na migração para a Meta oficial):** o convite é **enviado direto pelo Whaviso** ao convidado, por template aprovado (H5.0), nos dois fluxos. A decisão anterior (compartilhamento manual permanente por link `wa.me`, "vale mesmo após migrar para a Meta") foi **revogada**: na Meta Cloud API o modelo oficial e sancionado é o **template aprovado + opt-in**, e o próprio convite/aceite do whaviso já é, na prática, o opt-in. O caminho manual por número (H5.1) fica só como **reserva**. **Risco aceito:** um telefone digitado errado por quem cria faz o resumo do combinado (nomes, motivo, valor e, no invertido, a chave Pix) chegar à pessoa errada, e a proteção de telefone divergente (H5.8) só cobre o caminho de número, não o auto-envio. Mitiga-se conferindo o número na criação; o dono assume esse risco em troca de tirar a barreira do compartilhamento manual.
- **Efeito ao estourar 3 tentativas (H5.9):** distingue **telefone cadastrado** (gera novo número de validação, notifica quem convidou para reenviar) de **telefone não cadastrado** (bloqueia o número até um novo combinado ser enviado, mensagem diferente). Cada ciclo de 3 falhas, no caso cadastrado, gera novo número.
- **Rótulos dos botões:** os textos padrão (*Aceitar*, *Algum dado está incorreto* / *Chave Pix incorreta*, *Recusar combinado*) são confirmados, mas **editáveis pelo owner** (Épico 12).
- **Prazo de expiração:** **7 dias fixo** para todas as contas (universal, não varia; recursos não dependem de plano, H11.2).

### Decisões em aberto
- Nenhuma pendente neste épico.

### Fora de escopo deste épico
- ❌ Disparo, agendamento e textos dos lembretes pós-aceite (Épico 6).
- ❌ Interação do devedor já ativo (Já paguei / Ver Pix / Sair) (Épico 7).
- ❌ Confirmação de pagamento `informado_pago` (Épico 8).
- ❌ Conteúdo das notificações ao criador/cobrador (Épico 10).
- ❌ Oferta ao cobrador, no aceite de um invertido sem chave, para cadastrar a chave de pagamento (Épico 14).
