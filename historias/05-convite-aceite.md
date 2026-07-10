# Épico 5: Combinado & Aceite pelo WhatsApp

> O aceite acontece **100% pelo WhatsApp**, sem site e sem login. É a regra de ouro: o convidado só interage por botões.
> **O Whaviso inicia a conversa:** assim que o combinado é criado (ou ativado, na agenda) no modo enviar, o Whaviso **manda o combinado direto** para o WhatsApp do convidado, por template aprovado na Meta, com o resumo + os botões (H5.0). O convidado não precisa falar primeiro nem digitar nada: só toca um botão. Como o canal é a Meta Cloud API oficial (o Whaviso pode iniciar a conversa por template aprovado + opt-in), **não existe mais** número de convite, caminho de "escrever com um número", nem localização por número: essa maquinaria era herança da era em que não se podia iniciar a conversa.
> Vale para os dois fluxos: no **receber** o convidado é o devedor; no **pagar invertido** o convidado é o cobrador (que confere a chave Pix, ou a informa depois quando o combinado veio sem ela, Épico 14).
> O combinado é identificado internamente pelo **`aviso_id`** (no payload do botão), nunca por token exposto nem por número.
> Três respostas possíveis no aceite: **aceitar**, **algum dado está incorreto** (no invertido: **chave Pix incorreta**) e **recusar**. Em qualquer uma, **o criador é notificado**.
> Toda mensagem segue as convenções: gênero neutro, sem palavras proibidas, sem travessão (ver README).

---

### H5.0: O Whaviso envia o combinado ao convidado 🟢
Como **sistema (api + zap)**, quero mandar o combinado direto ao convidado assim que ele entra no modo enviar, para a pessoa receber o resumo e os botões sem precisar dar o primeiro passo.
*Critérios de aceite:*
- [ ] Ao **criar** (ou **ativar**, no modo agenda) um combinado no modo **enviar**, ele entra em `aguardando_aceite` e a **api enfileira um envio ao convidado** (outbox `notificacoes_cobrador`, tipo `combinado_enviar`), na **mesma transação** que cria/ativa o combinado.
- [ ] O **alvo é o convidado** (o não criador): no **receber** é o **devedor** (`telefone_devedor`); no **pagar invertido** é o **cobrador** (`telefone_cobrador`).
- [ ] O `zap` drena o envio e manda o **template aprovado** `combinado.resumo` (variante `revisao` no invertido, com a chave Pix para conferir), com o resumo + os **3 botões** (aceitar / dado incorreto / recusar) carregando o `aviso_id` no payload.
- [ ] **Gate de template (E12):** enquanto o `combinado.resumo` não estiver **aprovado na Meta**, o envio fica visível e recuperável (não some, não quebra) e sai assim que aprovar.
- [ ] **Idempotência:** um combinado gera **um** envio (dedupe por combinado); recriar, editar antes do aceite ou reativar não duplica.
- [ ] Sem telefone do convidado não há envio (a ativação já exige o telefone da outra ponta antes, Épico 4).
- [ ] **Sem compartilhamento manual e sem número:** a api **não devolve** link `wa.me`, mensagem pronta nem número de convite; o combinado é sempre enviado pelo Whaviso.
- [ ] Nada de telefone ou Pix aparece em log.

---

### H5.1: Ver o combinado e escolher a resposta 🟢
Como **convidado**, quero ver um resumo do combinado e responder por botão, para decidir com clareza e num toque.
*Critérios de aceite:*
- [ ] O combinado que o Whaviso envia (H5.0) traz um **resumo**: quem cobra/quem paga, motivo, valor e data combinada.
- [ ] No fluxo **invertido**, o resumo inclui a **chave Pix** informada pelo devedor, para o cobrador conferir.
- [ ] A resposta traz **botões** (rótulos **editáveis pelo owner**, ver Épico 12; textos abaixo são o padrão):
  - **Aceitar** (fluxo receber e invertido);
  - **Algum dado está incorreto** (no invertido: **Chave Pix incorreta**);
  - **Recusar combinado**.
- [ ] O botão carrega o **`aviso_id`** no payload (não token); o webhook é autenticado (HMAC).
- [ ] A mensagem traz uma **sugestão gentil de salvar o contato do Whaviso** (para não perder as próximas mensagens), sem obrigar e em linguagem neutra.
- [ ] **Fallback numerado (resiliência):** se os botões interativos não vingarem no aparelho da pessoa, ela pode responder **1/2/3** (aceitar / dado incorreto / recusar) e o Whaviso trata como o botão correspondente, desde que haja um combinado pendente de aceite para o telefone.
- [ ] Linguagem neutra quanto a gênero e sem palavras proibidas.

---

### H5.2: Aceitar o combinado 🟢
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

### H5.3: Sinalizar que algum dado está incorreto 🟢
Como **convidado**, quero avisar que algo está errado sem precisar explicar, para o criador revisar sem eu ter que digitar nada.
*Critérios de aceite:*
- [ ] Ao tocar **Algum dado está incorreto** (invertido: **Chave Pix incorreta**), o combinado **não é aceito nem recusado** (continua em `aguardando_aceite`).
- [ ] **Sem texto livre:** o convidado não descreve o que mudar; é só um sinal.
- [ ] O **criador é notificado** para revisar e reenviar (edição antes do aceite é livre, sem `aguardando_aprovacao_aviso_editado`, ver H2.5).
- [ ] O convidado recebe resposta neutra, ex.: *"Certo, vamos comunicar sua resposta."*
- [ ] O evento é registrado (auditoria append-only).

---

### H5.4: Recusar o combinado 🟢
Como **convidado**, quero recusar com um toque, para encerrar o que não reconheço ou não concordo.
*Critérios de aceite:*
- [ ] Ao tocar **Recusar combinado**, o combinado transita de **`aguardando_aceite` → `recusado`** (evento `recusado`).
- [ ] **`recusado` é um estado próprio**, distinto de `cancelado`: **recusado** = o convidado recusou; **cancelado** = o criador cancelou um Aviso seu pelo sistema (H2.6/H3.5). São terminais diferentes para não confundir quem encerrou o combinado.
- [ ] **recusado** é terminal: nunca mais envia nada.
- [ ] O **criador é notificado** da recusa (Épico 10).
- [ ] O convidado recebe resposta neutra, ex.: *"Tudo bem, combinado recusado. Vamos avisar quem convidou."*
- [ ] O combinado não é apagado do banco (regra de estados, não DELETE).

---

### H5.5: Segurança e idempotência do aceite 🟢
Como **sistema (zap)**, quero processar o aceite com segurança e sem duplicar efeitos, para evitar fraude e estados inconsistentes.
*Critérios de aceite:*
- [ ] O webhook valida a autenticidade da mensagem (HMAC); payloads de botão levam `aviso_id`, nunca token em claro.
- [ ] Estado **terminal** (`recusado`, `cancelado`, `pago`, `expirado`) **nunca reabre** nem reprocessa; um toque tardio recebe resposta informativa, não muda nada.
- [ ] O processamento é **idempotente**: tocar duas vezes no mesmo botão não duplica envios nem cria registros repetidos.
- [ ] Nunca logar telefone ou Pix.

---

### H5.6: Combinado expirado ou já respondido 🟢
Como **convidado**, quero entender quando o combinado não vale mais, para saber que preciso de um novo.
*Critérios de aceite:*
- [ ] Um combinado em `aguardando_aceite` **expira** (`aguardando_aceite → expirado`) após **7 dias** (prazo fixo, igual para todas as contas); depois disso não pode ser aceito.
- [ ] Convidado tocando um botão de um combinado **expirado** recebe orientação para pedir um novo a quem o enviou.
- [ ] Convidado tocando um botão de um combinado **já respondido** (aceito/recusado) recebe aviso de que já está resolvido, sem reprocessar (template `combinado.ja_respondido`).

---

### Divergências com a definição atual (precisam de refatoração)

- **Remover a maquinaria do número de convite:** o número de 6 dígitos, a coluna `convite_hash`, a tabela `convite_tentativas_telefone`, os índices únicos por (telefone, hash), o kernel `contracts/convite.ts`, e os templates `convite.pedir_numero`/`nao_encontrado`/`expirado`/`telefone_divergente`/`tentativas_cadastrado`/`bloqueado` (e as notificações `cobrador.convite_telefone_divergente`/`convite_tentativas_esgotadas`) saem. Com o Whaviso iniciando a conversa por botões, esse caminho de "localizar por número" e todo o anti-brute-force que ele exigia deixam de existir.
- **Renomear `convite.*` → `combinado.*`:** template `convite.resumo → combinado.resumo`, resposta `convite.ja_respondido → combinado.ja_respondido`, notificações `cobrador.convite_aceito/recusado/dado_incorreto → cobrador.combinado_*`, tipo de outbox `convite_enviar → combinado_enviar`, evento `convite_gerado → combinado_gerado`.
- **Resposta da api sem número:** `POST /avisos` e `POST /avisos/:id/ativar` deixam de devolver `numero_convite`; devolvem só o aviso. A tela de sucesso do front deixa de mostrar o número.
- **Webhook de texto simplificado:** sai a extração/validação do número, o `localizar por hash`, a detecção de telefone divergente e o anti-brute-force. Fica o **fallback numerado 1/2/3** (age só se houver combinado pendente para o telefone) e o **menu do devedor já ativo**; texto de telefone desconhecido cai em silêncio.

### Decisões tomadas
- **Aceite mantido como porteira:** o combinado nasce em `aguardando_aceite` e só entra no ciclo de lembretes quando o convidado toca **Aceitar**. É o opt-in exigido pela Meta (ver Épico 13) e o ponto de recusa/dado-incorreto.
- **Três respostas, sem texto livre:** aceitar / dado incorreto / recusar; "dado incorreto" só notifica o criador.
- **Criador sempre notificado** da resposta (aceite, dado incorreto, recusa).
- **Pix opcional no invertido** (Épico 3, decisão revista): se a chave veio no combinado, o cobrador confirma ao aceitar ou aponta como incorreta; se veio sem chave, o cobrador pode **informar a própria chave depois**, de forma guiada (Épico 14).
- **Linguagem neutra** quanto a gênero em todas as mensagens.
- **Recusa vira `recusado`** (não `cancelado`): terminal próprio para distinguir recusa do convidado de cancelamento pelo criador.
- **Whaviso inicia a conversa (decisão da migração para a Meta oficial):** o combinado é **enviado direto pelo Whaviso** ao convidado, por template aprovado (H5.0), nos dois fluxos. O modelo oficial e sancionado na Meta Cloud API é **template aprovado + opt-in**, e o próprio envio/aceite do Whaviso já é, na prática, o opt-in. **Risco aceito, agora sem rede:** um telefone digitado errado por quem cria faz o resumo do combinado (nomes, motivo, valor e, no invertido, a chave Pix) chegar à pessoa errada. Antes havia uma proteção de telefone divergente no caminho do número; como esse caminho deixou de existir, essa proteção **não existe mais**. Mitiga-se conferindo o número na criação; o dono assume esse risco em troca de tirar a barreira do compartilhamento manual e do número de validação.
- **Rótulos dos botões:** os textos padrão (*Aceitar*, *Algum dado está incorreto* / *Chave Pix incorreta*, *Recusar combinado*) são confirmados, mas **editáveis pelo owner** (Épico 12).
- **Prazo de expiração:** **7 dias fixo** para todas as contas (universal, não varia; recursos não dependem de plano, H11.2).
- **Fallback numerado:** além dos botões interativos oficiais da Meta, a resposta numerada 1/2/3 fica como resiliência geral (age só se houver combinado pendente para o telefone).

### Decisões em aberto
- Nenhuma pendente neste épico.

### Fora de escopo deste épico
- ❌ Disparo, agendamento e textos dos lembretes pós-aceite (Épico 6).
- ❌ Interação do devedor já ativo (Já paguei / Ver Pix / Sair) (Épico 7).
- ❌ Confirmação de pagamento `informado_pago` (Épico 8).
- ❌ Conteúdo das notificações ao criador/cobrador (Épico 10).
- ❌ Oferta ao cobrador, no aceite de um invertido sem chave, para cadastrar a chave pix (Épico 14).
