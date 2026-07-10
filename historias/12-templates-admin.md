# Épico 12: Templates / mensagens (admin)

> Toda mensagem que o Whaviso manda (lembrete do ciclo, aviso ao cobrador, resposta a botão, OTP) sai de um **template editável**, não de string fixa no código. O owner abre um editor, muda o texto e os rótulos dos botões, pré-visualiza e publica, sem mexer em código nem em deploy.
> **Uma tabela só, `templates`, chaveada por `chave`** (ex.: `ciclo.d_menos_2`, `ciclo.d`, `cobrador.pagamento_informado`, `resposta.ja_paguei`). O conteúdo é **estruturado** (texto + botões + mídia), não um blob de string.
> **Botão = código + template:** o **comportamento** do botão (a `acao`: já paguei, ver chave Pix, parar avisos, aceitar, recusar) é fixo no código; só o **rótulo** é editável. O owner muda como o botão se chama, nunca o que ele faz.
> **zap = transporte genérico:** o `zap` renderiza qualquer template (texto/botões/mídia) e dispara; **nenhuma string de negócio mora no código** do `zap`. Quem decide o texto é o catálogo de templates.
> Exceção de auditoria (CLAUDE.md): `templates` é **configuração, não auditoria**. Diferente do resto do negócio (append-only, sem DELETE), aqui o owner **pode apagar versões** de template, com uma guarda: **nunca apagar a versão ativa**.

---

### H12.1: Modelo unificado de templates 🟢
Como **owner/admin**, quero todas as mensagens numa única tabela chaveada, para editar qualquer texto do produto num só lugar, sem caça a strings espalhadas pelo código.
*Critérios de aceite:*
- [ ] Existe **uma** tabela `templates`, chaveada por `chave` estável (ex.: `ciclo.d_menos_2`, `ciclo.d`, `cobrador.pagamento_informado`, `resposta.ja_paguei`, `resposta.optout`, `resposta.ver_pix`, `resposta.sem_pix`, `resposta.aceite`, `resposta.recusa`, `billing.recarga`).
- [ ] O conteúdo é **estruturado** (jsonb): `{ texto, botoes: [{ acao, rotulo }], midia: { tipo, url } }`, não uma string solta.
- [ ] Não há tabelas paralelas por etapa/tipo (as antigas `templates_mensagem` e `templates_cobrador` foram unificadas nesta).
- [ ] Há **um catálogo da estrutura** (quais chaves existem, quais variáveis e quais ações cada chave aceita), fonte para o editor saber o que oferecer.
- [ ] Todo texto editado respeita as regras de ouro (sem palavras proibidas, sem travessão, gênero neutro); detalhe e garantias no Épico 13.

---

### H12.2: Edição de texto com paleta de variáveis 🟢
Como **owner**, quero escrever o texto da mensagem inserindo variáveis de uma paleta, para personalizar sem decorar nomes nem errar a sintaxe.
*Critérios de aceite:*
- [ ] O editor de uma chave (`/admin/mensagens/:chave`) mostra o **texto** e uma **paleta de variáveis válidas para aquela chave** (ex.: nome, valor, vencimento), vinda do catálogo (H12.1).
- [ ] As variáveis disponíveis **mudam por chave**: o editor só oferece o que faz sentido naquela mensagem.
- [ ] Na renderização, as variáveis são substituídas pelos valores reais montados pelo módulo do `zap` que envia (ver H12.8).
- [ ] Valor em dinheiro é renderizado a partir de **centavos** (formatação na borda, ver convenções), datas em **America/Sao_Paulo**.

---

### H12.3: Botões editáveis (rótulo sim, ação não) 🟢
Como **owner**, quero editar o **rótulo** dos botões da mensagem, mas nunca o comportamento, para ajustar a copy sem quebrar o fluxo.
*Critérios de aceite:*
- [ ] O editor lista os botões da chave com a **ação fixa** (`ja_paguei`, `ver_pix`, `optout`, `aceite`, `recusa`) e um campo de **rótulo editável** por botão.
- [ ] A **ação** é comportamento de código, **não editável** pelo owner: trocar o rótulo nunca muda o que o botão dispara.
- [ ] O catálogo define **quais ações** cada chave aceita; o editor não deixa inventar ação fora dessa lista.
- [ ] No ciclo, o botão **"ver chave Pix" é suprimido no envio** quando o aviso **não tem Pix** (decisão de envio, não de template), ver Épico 6/7.
- [ ] No aceite, a estrutura de botões cobre as **três opções** (aceitar / algum dado incorreto / recusar), conforme convenções do README e Épicos 2, 3 e 5.

---

### H12.4: Variante de contexto (padrão / revisão) 🟢
Como **owner**, quero editar variações da mesma mensagem por contexto, para que o ciclo fale diferente antes e depois de o devedor informar pagamento.
*Critérios de aceite:*
- [ ] Uma chave pode ter **contexto** (ex.: o ciclo tem `padrao` e `revisao`): cada contexto tem sua própria versão ativa e suas propostas.
- [ ] O editor mostra um **alternador padrão/revisão** apenas nas chaves que têm variante (marcadas no catálogo); chaves sem variante não mostram o alternador.
- [ ] A variante **revisão** é usada quando o aviso está em `informado_pago` (lembretes continuam, mas com outra fala), ver Épico 8.
- [ ] A seleção do contexto na hora do envio é do código (estado do aviso), não do owner.

---

### H12.5: Versionamento e publicação 🟢
Como **owner**, quero criar uma nova versão da mensagem, revisar e publicar, para mudar o texto com segurança e poder voltar atrás.
*Critérios de aceite:*
- [ ] Salvar uma edição **cria uma nova versão** da chave/contexto; ela **nasce pendente** (não entra no ar sozinha).
- [ ] Há um passo de **aprovação** explícito antes de poder ativar: o owner **submete** a versão à Meta pelo painel, e ela só fica aprovada quando a **Meta aprova o template** correspondente (webhook/reconcile refletem o veredito real).
- [ ] A versão pendente tem **dois momentos visíveis** ao owner, distintos em toda tela de template (lista, legenda, trilha do ciclo e badge do detalhe): **"Não enviado à Meta"** (nunca submetida, ou a submissão falhou antes de a Meta receber, ainda dá pra clicar em submeter) e **"Em análise na Meta"** (já submetida, aguardando o veredito). Somada aos vereditos **"Aprovado na Meta"** e **"Recusado pela Meta"**, o owner identifica o status real de cada versão sem abrir cada uma.
- [ ] **Ativar** uma versão só é permitido se ela estiver **aprovada**; ativar versão não aprovada é recusado (envelope `{ error: { code, message } }`).
- [ ] Ativar uma versão **substitui** a ativa daquela chave/contexto; as versões antigas ficam disponíveis (histórico de versões).
- [ ] A versão **ativa** é a única que o `zap` usa em runtime (ver H12.8); editar não afeta o ar até ativar.

---

### H12.6: Apagar versão (exceção de DELETE) 🟢
Como **owner**, quero apagar versões de template que não uso, mantendo a guarda de nunca apagar o que está no ar, para limpar rascunhos sem risco.
*Critérios de aceite:*
- [ ] O owner pode **apagar uma versão** de template (DELETE físico): `templates` é configuração, não auditoria, então a regra de não-DELETE de negócio **não se aplica** aqui (exceção registrada em CLAUDE.md).
- [ ] **Nunca** é possível apagar a **versão ativa**: a API recusa com `{ error: { code, message } }` (409).
- [ ] O role `whaviso_api` tem DELETE **só** nesta tabela; nenhuma outra tabela de negócio/auditoria ganha DELETE por isso.
- [ ] Apagar uma versão pendente/antiga não afeta o que está no ar.

---

### H12.7: Pré-visualização da mensagem 🟢
Como **owner**, quero ver como a mensagem fica renderizada antes de publicar, para conferir texto, variáveis e botões sem mandar pra ninguém.
*Critérios de aceite:*
- [ ] O editor oferece um **preview** que renderiza o texto com **valores de exemplo** das variáveis e mostra os botões com os rótulos atuais.
- [ ] O preview **não envia** nada a ninguém (não toca em outbox nem em WhatsApp).
- [ ] O preview usa o **mesmo renderizador** do envio real (mesma substituição de variáveis), para o que se vê ser o que vai sair.

---

### H12.8: zap como transporte genérico 🟢
Como **sistema (zap)**, quero renderizar e enviar qualquer template a partir da chave e dos valores, para não carregar nenhuma string de negócio no código.
*Critérios de aceite:*
- [ ] O `zap` **não contém texto de mensagem de negócio**: ele carrega a **versão ativa** do template pela chave/contexto e renderiza com os valores que o módulo monta.
- [ ] O transporte entende **texto + botões + mídia** de forma genérica (uma única abstração de mensagem do WhatsApp), independente da chave.
- [ ] Cada módulo que envia (lembretes do ciclo, notificação ao cobrador, respostas do webhook, OTP) **monta o mapa de valores** e chama o renderizador; nenhum monta string própria.
- [ ] Se a chave/contexto não tiver versão ativa, o envio falha de forma controlada (sem mandar mensagem quebrada) e fica registrado para o owner corrigir.
- [ ] O provider de WhatsApp (Meta Cloud API) fica atrás da mesma abstração de transporte: trocar de provider não muda os templates (CLAUDE.md).

---

### H12.9: Hub de navegação das mensagens 🟢
Como **owner**, quero uma tela que lista todas as mensagens do produto agrupadas, para achar e abrir a que quero editar.
*Critérios de aceite:*
- [ ] Há uma **tela hub** (`/admin/templates`) que mostra as famílias de mensagem: a **trilha do ciclo** (D-2 a D+1) e as demais famílias (cobrador, respostas, **compra de crédito** `billing.*`).
- [ ] Cada item do hub leva ao **editor da chave** (`/admin/mensagens/:chave`).
- [ ] O hub e o editor são área **admin/owner** (acesso restrito, ver Épico 1); usuário comum não chega lá.
- [ ] A navegação reflete o **catálogo** (H12.1): adicionar uma chave nova ao catálogo a faz aparecer no hub, sem tela nova.

---

### H12.10: Famílias ainda sem editor 🟡
Como **owner**, quero que as mensagens que hoje não têm chave editável sejam migradas para o mesmo modelo, para um dia editar tudo no mesmo lugar.
*Critérios de aceite:*
- [ ] 🟢 A família `convite.*`: o **resumo do aceite** (`convite.resumo`, botões aceitar/dado incorreto/recusar) **já é editável** no hub; o envio depende do template estar **aprovado na Meta** (gate por chave, ver Épico 5 H5.2). O convite inicial continua saindo por link `wa.me` que o criador compartilha (H5.1, por design); as demais respostas `convite.*` (pedir número, expirado, etc.) seguem como texto do fluxo e entram no editor quando precisarem.
- [ ] 🟡 A família `conta.*`: o **OTP de login** já é um **template Meta** (categoria autenticação), com o mesmo modelo de submissão/aprovação por chave das demais famílias; falta ligar **boas-vindas** ao mesmo modelo (ainda planejado).
- [ ] 🟡 Quando ligadas, essas famílias entram **na mesma tabela e no mesmo editor**, sem modelo paralelo.

---

### Divergências com a definição atual (precisam de refatoração)

> A consolidação de templates já foi feita no código (uma tabela, um editor, zap genérico). As divergências aqui são pontos a **confirmar/fechar** na fase de validação, não reescritas grandes.

- **Aprovação é a da Meta (não há passo manual separado):** o passo de "aprovar" (H12.5) é a própria aprovação da Meta. O owner **submete** a versão pelo painel (`/admin/mensagens/:id/submeter`); o `zap` cria/edita o template na WABA e o campo `status_meta` passa a refletir o veredito real (pendente, aprovado, rejeitado), via webhook e reconcile. Só uma versão com `status_meta='aprovado'` pode ser ativada. O painel deriva de `status_meta` + `meta_submetido_em` quatro situações visíveis ao owner (não enviado à Meta / em análise / aprovado / recusado), consistentes em todas as telas de template.
- **Famílias sem editor (`conta.*`):** `convite.resumo` já entrou no editor; o OTP (`conta.*`) também passou a ser um template Meta sujeito ao mesmo modelo de aprovação; falta só `boas-vindas`, que entra no mesmo modelo quando for ligado.
- **Garantia de linguagem no editor:** as regras de ouro (palavras proibidas, travessão, gênero neutro) precisam ser **validadas ao salvar** o template, não só confiar no owner. Amarração com o Épico 13 (`contracts/linguagem.ts` / dicionário do front); confirmar se a validação roda no editor hoje.

### Decisões tomadas
- **Uma tabela `templates` por chave**, conteúdo estruturado (texto/botões/mídia), sem tabelas paralelas por etapa/tipo.
- **Botão = ação fixa no código + rótulo editável**; owner nunca muda comportamento.
- **Contexto por chave** (padrão/revisão no ciclo), alternador só onde há variante.
- **Versão nasce pendente → aprovar → ativar**; só a ativa vai ao ar; ativar exige aprovada.
- **Exceção de DELETE:** owner apaga versões; nunca a ativa; `whaviso_api` com DELETE só nesta tabela.
- **Preview sem envio**, mesmo renderizador do envio real.
- **zap genérico:** nenhuma string de negócio no código; carrega a versão ativa por chave/contexto e renderiza.
- **Hub `/admin/templates` + editor `/admin/mensagens/:chave`**, área owner, dirigidos pelo catálogo.
- **`convite.resumo` é editável** e sujeito ao gate de aprovação na Meta, como as demais chaves; `conta.*` (OTP) já segue o mesmo modelo (falta só `boas-vindas`).

### Decisões em aberto
- Nenhuma pendente neste épico.

### Fora de escopo deste épico
- ❌ Textos finais de cada mensagem (copy): aqui é o **mecanismo** de edição, não o conteúdo.
- ❌ Regras de linguagem/compliance em si (palavras proibidas, opt-out, gênero neutro): Épico 13.
- ❌ Critérios de revisão da Meta para aprovar um template: são definidos pela própria Meta, fora do controle deste épico (o convite por botões já funciona via Meta Cloud API, Épico 5).
- ❌ Qual variável existe em cada chave (catálogo de conteúdo): é dado do catálogo, não história.
