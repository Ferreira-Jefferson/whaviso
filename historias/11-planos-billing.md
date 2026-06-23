# Épico 11: Planos, limites e billing

> O Whaviso é um SaaS: o que cada conta pode fazer depende do **plano**. O plano é um conjunto de **alavancas** (quantos avisos ativos, tamanho da agenda, recorrência, cadência configurável, confirmação de pagamento, menu de texto livre) e um **preço**.
> No MVP o pagamento ainda **não tem gateway**: o billing é um **stub trial** (a conta nasce num plano e o limite é aplicado de verdade, mas a cobrança em dinheiro fica para depois). O que **já vale no MVP** é a aplicação dos limites; o que é **gated** é a cobrança real e a troca de plano com dinheiro.
> Regra-mãe deste épico (já decidida em vários outros): **free mantém agenda e visualiza, mas não ativa envio**. Tudo que dispara mensagem passa por uma vaga de plano.
> **A agenda é literalmente uma agenda, um balde único.** Todo combinado é uma **anotação na agenda**, não importa como nasceu: criado como cobrador (fluxo receber), cadastrado como pagador (fluxo invertido), ou só anotado sem nunca virar aviso. Ativo, pausado ou só anotação, **tudo conta igual** para o limite de agenda do plano. O que o plano define é **quantas anotações** a conta mantém (e quais recursos ela libera).
> Catálogo é **dado de catálogo**, não auditoria: vive em **migration** (upsert), nunca no seed (o seed não roda no cloud, ver CLAUDE.md).

---

### H11.1: Catálogo de planos 🟢
Como **owner/admin**, quero um catálogo de planos versionado, para que cada conta seja associada a um plano com limites e recursos bem definidos.
*Critérios de aceite:*
- [ ] Existe um catálogo de planos com, no mínimo, estas **alavancas** por plano: **vagas de aviso ativo**, **capacidade de agenda**, **recorrência habilitada (sim/não)**, **cadência configurável (sim/não)**, **menu de texto livre (sim/não)**, **confirmação de pagamento / `informado_pago` (sim/não)**, **histórico/totais por período (sim/não)**.
- [ ] São **4 planos**: **Free**, **Start**, **Profissional** e **Plus** (chaves estáveis ex.: `free`, `start`, `profissional`, `plus`).
- [ ] Cada plano tem **chave estável**, **nome de exibição** e **preço** (em centavos; pode ser 0). **Preços = os de hoje** (PROJETO.md), só os nomes mudaram e o Free foi adicionado: **Free R$ 0**, **Start R$ 9,90/mês** (era o "pessoal"), **Profissional R$ 29/49** (mesmo preço/nome de hoje), **Plus** vendido por **unidade** (cada unidade = 1 combinado ativável, ver H11.3).
- [ ] O catálogo vive em **migration (upsert idempotente)**, não no seed; mudar valor de plano é mudança de catálogo e exige `supabase db push` no cloud (ver CLAUDE.md / memória `whaviso-dev-db`).
- [ ] Toda conta referencia **um** plano vigente (default na criação = **free**, ver Épico 1).
- [ ] A linguagem do catálogo respeita as regras de ouro (sem "dívida/cobrança/atraso") e gênero neutro.

---

### H11.2: Plano free, visualizar e agendar sem ativar 🟢
Como **pessoa no plano free**, quero usar o Whaviso como agenda e visualizar tudo, mesmo sem poder enviar, para conhecer o produto antes de pagar.
*Critérios de aceite:*
- [ ] No free consigo **criar itens de agenda** (`sem_aviso`) até o limite do free (ver H11.4) e **visualizar** o painel inteiro (ver Épico 9).
- [ ] No free **não consigo ativar** nenhum combinado (não gera convite, não dispara lembrete): a ação **ativar** leva à **CTA de upgrade** (H11.6), sem erro feio.
- [ ] O menu de **texto livre** do devedor, no free, é **silêncio** (sem resposta automática a mensagem fora dos botões), ver Épico 7 H7.1.
- [ ] Free **não tem** recorrência, cadência configurável nem totais por período; esses recursos aparecem como **bloqueados/CTA**, não somem da interface.
- [ ] Nada no free dispara mensagem ao devedor ou ao cobrador: free é estado **sem custo de envio**.

---

### H11.3: Ativação de envio por plano 🟢
Como **sistema**, quero controlar quem pode ativar envio e quanto, conforme o plano, para que ninguém envie além do que contratou.
*Critérios de aceite:*
- [ ] Ativar = um combinado **sai da agenda e passa a enviar** (`sem_aviso → aguardando_aceite` e os estados seguintes do ciclo), ver Épico 4 H4.3.
- [ ] **Free não ativa nada**: pode manter anotações na agenda, mas qualquer ativação leva à CTA de upgrade (H11.6).
- [ ] **Start e Profissional** podem ativar dentro do limite de agenda do plano (não há contagem de "vaga ativa" separada da agenda; a agenda é o balde único, ver H11.4).
- [ ] **Plus** é vendido por **unidade**: cada unidade = **1 combinado ativável**. A conta pode ter no máximo tantos combinados ativos quantas unidades contratou; a agenda é **10 anotações por unidade** (ver H11.4).
- [ ] **`pausado` ocupa vaga** e continua contando (o combinado segue "vivo", só não dispara no momento). `sem_aviso` é anotação (não envia, mas conta na agenda).
- [ ] Ao tentar ativar **além do permitido** (free, ou personalizado sem unidade livre), a API recusa com envelope `{ error: { code, message } }` e o front mostra a **CTA de upgrade** (H11.6), mantendo o item na agenda.
- [ ] A contagem é **por conta** (isolamento por usuário, ver Épico 9 H9.8) e validada **no servidor** (H11.8), nunca só no front.

---

### H11.4: Limite de capacidade de agenda 🟢
Como **sistema**, quero limitar quantas anotações cada conta mantém na agenda, conforme o plano, para a agenda não virar um depósito infinito.
*Critérios de aceite:*
- [ ] A **agenda é um balde único**: **toda** anotação conta igual (ativa, pausada ou só anotação `sem_aviso`). Não há contagem separada de "agenda" vs "ativos"; o limite do plano é o **total de anotações**.
- [ ] **Um item ativado continua ocupando seu lugar na agenda** (ativar não libera o slot, é a mesma anotação).
- [ ] Valores por plano: **Free 50**, **Start 100**, **Profissional 150**, **Plus 10 por unidade** (ex.: 5 unidades → 50 anotações).
- [ ] Ao atingir a capacidade, criar nova anotação é recusado no servidor com CTA de upgrade, sem apagar nada do que já existe.
- [ ] **Anotações em estado terminal** (`pago`/`cancelado`/`recusado`/`expirado`) **continuam contando**: a agenda registra o que aconteceu, como uma agenda de verdade. O **sistema nunca remove sozinho**.
- [ ] **Só o usuário** pode tirar algo da agenda, por ação manual. Como há a regra de não-DELETE de negócio (auditoria append-only), "excluir da agenda" é **arquivamento** (sai da contagem/visão da agenda), **não** um DELETE físico do registro. *Ver divergência.*
- [ ] A contagem é por conta e validada no servidor (H11.8).

---

### H11.5: Recursos por plano (recorrência, cadência, menu, confirmação, totais) 🟢 / 🟡
Como **sistema**, quero ligar/desligar recursos conforme o plano, para diferenciar o free e o pago e sustentar a monetização.
*Critérios de aceite:*
- [ ] **Recorrência** (combinado com N ocorrências, Épico 6 H6.10 / Épico 8 H8.7): disponível só em plano que a habilite; 🟡 enquanto a recorrência em si não estiver ligada.
- [ ] **Cadência configurável** (Épico 6 H6.10): o **cobrador escolhe quais D-avisos** do ciclo são enviados (quais dias do D-2 a D+1); o **devedor do fluxo invertido** também pode configurar como quer receber as notificações. **Free e Start NÃO têm** essa opção (usam a cadência padrão); **Profissional e Plus** têm.
- [ ] **Menu de texto livre** ao devedor (Épico 7 H7.1): habilitado nos planos pagos, **silêncio** no free.
- [ ] **Confirmação de pagamento / `informado_pago`** (Épico 8): como o **free não ativa avisos**, ele **não recebe `informado_pago`** (não há devedor confirmando pagamento de um aviso que ele nem disparou). Como **devedor** de um aviso de outra conta, um usuário free só recebe o que decorre de ser devedor (lembretes, aviso de "pagamento informado/confirmado pelo cobrador"). O ciclo de confirmação como cobrador exige plano que ative envio.
- [ ] **Histórico completo / totais por período / múltiplos clientes** (Épico 9): recurso de plano pago; no free o painel mostra o básico.
- [ ] **Reengajamento manual pós-ciclo** (Épico 8 H8.3, "ainda não localizei o pagamento"): **até 3 envios por combinado**, **nunca dois no mesmo dia**.
- [ ] Cada recurso bloqueado aparece como **CTA**, não some da interface (H11.6).

---

### H11.6: CTA de upgrade nos pontos de bloqueio 🟢
Como **pessoa num plano que não cobre a ação**, quero ser avisado de forma clara e levada ao upgrade no momento do bloqueio, para entender o porquê e decidir pagar.
*Critérios de aceite:*
- [ ] Toda recusa por limite/recurso (ativar sem vaga, agenda cheia, recurso só de pago) mostra uma **CTA discreta e clara** explicando o limite e oferecendo upgrade.
- [ ] A CTA **nunca** destrói trabalho: o item fica na agenda, os dados ficam salvos, nada é enviado.
- [ ] A CTA usa linguagem das regras de ouro (sem "dívida/cobrança", gênero neutro, sem travessão) e tom direto (PROJETO.md: tom de produto = prático).
- [ ] A CTA aparece tanto na ação de **ativar** (H4.3) quanto nas ações de recurso (H11.5).

---

### H11.7: Billing como stub trial no MVP 🟢 / gateway real 🟡
Como **owner**, quero que no MVP os limites valham de verdade mas a cobrança em dinheiro seja um stub, para validar o produto antes de integrar pagamento.
*Critérios de aceite:*
- [ ] No MVP, associar uma conta a um plano pago é **manual/stub** (sem gateway): o limite passa a valer, mas **nenhum pagamento real** é processado.
- [ ] A conta nasce em **free** e os limites do free valem desde o primeiro acesso.
- [ ] 🟡 **Gateway de pagamento** (assinatura recorrente, faturas, falha de pagamento, dunning) é **futuro**: não existe no MVP.
- [ ] 🟡 **Estado de assinatura** (ativa / em atraso de pagamento / cancelada) e o que acontece com avisos ativos quando a assinatura cai ficam para a fase de billing real (ver H11.9).
- [ ] Não logar dado sensível de pagamento (quando existir gateway); seguir a regra de nunca logar telefone/Pix/token.

---

### H11.8: Validação do limite no servidor (defesa em profundidade) 🟢
Como **sistema**, quero validar todo limite de plano na API e no banco, para que o front nunca seja a fonte da verdade sobre o que a conta pode fazer.
*Critérios de aceite:*
- [ ] O front pode **antecipar** o bloqueio (esconder/cinzar botão), mas a decisão final é **sempre** da API + banco (mesma postura do Épico 8 H8.9 e Épico 9 H9.8).
- [ ] Tentativa de burlar pelo front (chamar a API direto) é recusada no servidor com envelope `{ error: { code, message } }`.
- [ ] A contagem de vagas/agenda é feita no servidor com a transação que ativa/cria (sem janela de corrida que permita ultrapassar o limite). *Ponto de teste dedicado.*
- [ ] Os limites do plano vigente da conta são lidos do catálogo (H11.1), não fixados em código.

---

### H11.9: Mudar de plano (upgrade / downgrade) 🟡
Como **pessoa assinante**, quero trocar de plano, para subir quando preciso de mais e descer quando uso menos, sem perder meus combinados.
*Critérios de aceite:*
- [ ] 🟡 Upgrade aplica os novos limites **imediatamente** (mais vagas/agenda/recursos liberados).
- [ ] 🟡 Downgrade com **excedente** (mais avisos/anotações do que o plano novo permite) **mantém ativo** o que já existe: nada é apagado nem desligado, os combinados ativos seguem até virarem terminais, mas a conta fica **sem poder criar/ativar novos** até voltar abaixo do limite.
- [ ] 🟡 Nenhuma troca de plano dispara DELETE de negócio; tudo é mudança de estado/associação (regra de não-DELETE).
- [ ] 🟡 Depende do billing real (H11.7); fora do MVP.

---

### Divergências com a definição atual (precisam de refatoração)

> O catálogo de planos do **PROJETO.md** (seção 8) e o que os épicos foram decidindo **não batem**. As histórias são a fonte de verdade: o catálogo precisa ser reescrito para o modelo abaixo.

- **Modelo de planos:** PROJETO.md descreve "pessoal R$ 9,90 (até 5 avisos)" e "profissional R$ 29/49". As histórias decidiram **4 planos: Free, Start, Profissional, Plus**, com a **agenda como balde único** (Free 50 / Start 100 / Profissional 150 / Plus 10 por unidade) e o Plus vendido por unidade (1 unidade = 1 combinado ativável). PROJETO.md seção 8 precisa ser reescrito para este modelo. **Preços finais ainda em aberto.**
- **Free passa a manter agenda:** hoje o free "só visualiza" (Épico 1 H1.5 / Épico 2). Com o modo agenda (Épico 4), o free **cria item de agenda** mas **não ativa**. Refatorar a regra de plano para distinguir "criar agenda" de "ativar/enviar".
- **Limites no servidor a partir do catálogo:** se hoje há limite fixado em código, mover para leitura do catálogo (H11.1) em migration.
- **`informado_pago` / cadência / recorrência como recurso de plano:** amarrar esses recursos ao plano exige um ponto único que consulta as alavancas do catálogo; verificar se a checagem hoje existe e onde.
- **"Excluir da agenda" manual = arquivar, não DELETE:** o usuário pode tirar uma anotação da agenda (libera o slot do limite), mas pela regra de não-DELETE de negócio (Épico 4 H4.4 / CLAUDE.md) isso é um **arquivamento** (estado/flag que some da visão e da contagem), nunca um DELETE físico. Precisa de um estado/flag de "arquivado na agenda" a modelar; verificar se hoje existe.

### Decisões tomadas
- **Quatro planos:** **Free, Start, Profissional, Plus** (este vendido por unidade).
- **Agenda é balde único:** tudo é anotação (ativo, pausado ou só anotação contam igual). Capacidade: **Free 50, Start 100, Profissional 150, Plus 10 por unidade**. Item ativado **continua ocupando** seu lugar na agenda.
- **Free = agenda + visualização, sem ativar.** Free não dispara nada e, por isso, **não recebe `informado_pago`** como cobrador.
- **1 unidade do Plus = 1 combinado ativável**; cada unidade dá 10 anotações de agenda.
- **`pausado` ocupa vaga** (segue vivo, só não dispara).
- **Cadência configurável** (escolher quais D-avisos / como o devedor invertido recebe): só **Profissional e Plus**; Free e Start usam a padrão.
- **Reengajamento manual pós-ciclo** (H8.3): até **3 envios por combinado**, nunca dois no mesmo dia.
- **`informado_pago` e dados do free persistem:** os dados ficam no banco normalmente (mesmo sem conta criada), pois são base para a agenda/combinados do cobrador; se a conta vier a ativar depois, nada se perde.
- **Downgrade com excedente: mantém ativo** o que existe; só trava criar/ativar novos até voltar abaixo do limite.
- **Preços = os de hoje:** Free R$ 0, Start R$ 9,90 (era o "pessoal"), Profissional R$ 29/49 (mantém nome e preço de hoje), Plus por unidade.
- **Anotações em estado terminal continuam contando** na agenda (a agenda registra o que aconteceu). O sistema nunca remove sozinho; só o usuário, manualmente (arquivamento, não DELETE físico).
- **Validação no servidor** (defesa em profundidade): o front só antecipa; API+banco decidem.
- **MVP = stub trial:** limites valem, cobrança em dinheiro é futura.
- **Expiração de convite (7 dias) é fixa** e **não** é alavanca de plano (Épico 5 H5.7): não entra no catálogo.

### Decisões em aberto
- Nenhuma pendente neste épico.

### Fora de escopo deste épico
- ❌ Gateway de pagamento, faturas, assinatura recorrente, dunning (billing real, 🟡).
- ❌ Textos finais das CTAs de upgrade (entram com o épico de Templates/mensagens e o design do painel).
- ❌ Mecânica de cada recurso em si (recorrência, cadência, menu): definida nos épicos 6, 7 e 8; aqui só o **liga/desliga por plano**.
- ❌ Limites de envio do WhatsApp/Baileys que afetam a operação (capacidade do canal): é restrição operacional do transporte (Épico 10), não alavanca comercial de plano.
