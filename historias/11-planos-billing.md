# Épico 11: Planos, limites e billing

> O Whaviso é um SaaS: o que cada conta pode fazer depende do **plano**. O plano é um conjunto de **alavancas** (quantos avisos ativos, tamanho da agenda, recorrência, cadência configurável, confirmação de pagamento, menu de texto livre) e um **preço**.
> No MVP o pagamento ainda **não tem gateway**: o billing é um **stub trial** (a conta nasce num plano e o limite é aplicado de verdade, mas a cobrança em dinheiro fica para depois). O que **já vale no MVP** é a aplicação dos limites; o que é **gated** é a cobrança real e a troca de plano com dinheiro.
> Regra-mãe deste épico (já decidida em vários outros): **free mantém agenda e visualiza, mas não ativa envio**. Tudo que dispara mensagem passa por uma vaga de plano.
> **A agenda é literalmente uma agenda, um balde único.** Todo combinado é uma **anotação na agenda**, não importa como nasceu: criado como cobrador (fluxo receber), cadastrado como pagador (fluxo invertido), ou só anotado sem nunca virar aviso. Ativo, pausado ou só anotação, **tudo conta igual** para o limite de agenda do plano. O que o plano define é **quantas anotações** a conta mantém (e quais recursos ela libera).
> Catálogo é **dado de catálogo**, não auditoria. A **migration semeia** os valores iniciais (e o schema); a partir daí o **owner edita preço/limites/recursos pela tela de admin** (ver H11.11). O catálogo é **versionado**: cada edição cria uma **nova versão** do plano (as anteriores são preservadas). Como o produto **já está em produção com clientes pagantes**, editar o catálogo **não muda quem já paga**: cada assinatura fixa a **versão contratada** (preço, limites e recursos) e edições só valem para **novas contratações**; no vencimento a assinatura adota a versão corrente (ver H11.12). O free acompanha a versão corrente.

---

### H11.1: Catálogo de planos 🟢
Como **owner/admin**, quero um catálogo de planos versionado, para que cada conta seja associada a um plano com limites e recursos bem definidos.
*Critérios de aceite:*
- [ ] Existe um catálogo de planos com, no mínimo, estas **alavancas** por plano: **vagas de aviso ativo**, **capacidade de agenda**, **recorrência habilitada (sim/não)**, **cadência configurável (sim/não)**, **menu de texto livre (sim/não)**, **confirmação de pagamento / `informado_pago` (sim/não)**, **histórico completo (sim/não)**. (**Totais por período**, a consolidação do painel, **não** é alavanca: é base em todos os planos, ver H11.5.) A recorrência **não** acrescenta alavanca de cota: cada **ocorrência** reserva **1 vaga de aviso ativo** (ver H11.3/H11.5).
- [ ] São **4 planos**: **Free**, **Start**, **Profissional** e **Plus** (chaves estáveis ex.: `free`, `start`, `profissional`, `plus`).
- [ ] Cada plano tem **chave estável**, **nome de exibição** e **preço** (em centavos; pode ser 0): **Free R$ 0**, **Start R$ 9,90/mês**, **Profissional R$ 23,90/mês**, **Plus** vendido por **volume de envios** (de 26 a 200 envios de aviso, total de **R$ 24,00 a R$ 140,00**; o R$/envio cai conforme o volume sobe, ver H11.3 e a curva nas Decisões).
- [ ] O **schema e o seed inicial** do catálogo vivem em **migration** (upsert idempotente, nunca no seed que não roda no cloud; `supabase db push`, ver CLAUDE.md / memória `whaviso-dev-db`). Depois disso, **mudar valor de plano é edição do owner em runtime** (cria nova versão, H11.11/H11.12), não exige migration; só mudança de **schema** ou **plano novo** exige `db push`.
- [ ] Toda conta referencia **um** plano vigente (default na criação = **free**, ver Épico 1).
- [ ] A linguagem do catálogo respeita as regras de ouro (sem "dívida/cobrança/atraso") e gênero neutro.

---

### H11.2: Plano free, visualizar e agendar sem ativar 🟢
Como **pessoa no plano free**, quero usar o Whaviso como agenda e visualizar tudo, mesmo sem poder enviar, para conhecer o produto antes de pagar.
*Critérios de aceite:*
- [ ] No free consigo **criar itens de agenda** (`sem_aviso`) até o limite do free (ver H11.4) e **visualizar** o painel inteiro (ver Épico 9).
- [ ] No free **não consigo ativar** nenhum combinado (não gera convite, não dispara lembrete): a ação **ativar** leva à **CTA de upgrade** (H11.6), sem erro feio.
- [ ] O menu de **texto livre** do devedor, no free, é **silêncio** (sem resposta automática a mensagem fora dos botões), ver Épico 7 H7.1.
- [ ] Free **não tem cadência configurável** (recurso pago); aparece como **bloqueada/CTA**, não some. **Recorrência NÃO é recurso pago** (é facilitador, ver H11.5): o free pode montar um combinado recorrente **na agenda** (não envia, como tudo no free); ativar/enviar segue barrado pela regra do free. (**Totais por período** é base: o free também consolida o painel, ver H11.5.)
- [ ] Nada no free dispara mensagem ao devedor ou ao cobrador: free é estado **sem custo de envio**.

---

### H11.3: Ativação de envio por plano 🟢
Como **sistema**, quero controlar quem pode ativar envio e quanto, conforme o plano, para que ninguém envie além do que contratou.
*Critérios de aceite:*
- [ ] Ativar = um combinado **sai da agenda e passa a enviar** (`sem_aviso → aguardando_aceite` e os estados seguintes do ciclo), ver Épico 4 H4.3.
- [ ] **Free não ativa nada**: pode manter anotações na agenda, mas qualquer ativação leva à CTA de upgrade (H11.6).
- [ ] Cada plano tem um teto de **vagas de aviso ativo**, vendido ao cliente como **"envios de aviso"**: **Free 0**, **Start 10**, **Profissional 25**, **Plus de 26 a 200** (o cliente escolhe o volume). Esse teto é **separado** da capacidade de agenda (H11.4): a conta pode **anotar** mais do que **ativa e envia**.
- [ ] **Start e Profissional** ativam até o seu teto de vagas (10 e 25). Ao atingir o teto, ativar é recusado com CTA de upgrade (H11.6), sem desativar nada do que já está ativo.
- [ ] **Plus** é vendido por **volume de envios**: cada envio contratado vale **1 vaga de aviso ativo** e **10 anotações de agenda** (ver H11.4). A conta pode ter no máximo tantos combinados ativos quantos envios contratou.
- [ ] **`pausado` ocupa vaga** e continua contando (o combinado segue "vivo", só não dispara no momento). `sem_aviso` é anotação (não envia, mas conta na agenda).
- [ ] **Combinado recorrente e vagas (ver H11.5):** cada **ocorrência** de um recorrente reserva **1 vaga de aviso ativo**, porque cada ocorrência é um envio (a moeda do plano, "envios de aviso"). Um recorrente de N ocorrências reserva **N vagas** na ativação; conforme cada ocorrência é confirmada (`pago`), sua vaga é **liberada** (a contagem usa as ocorrências **ainda não pagas**). Por isso a contagem de vagas deixa de ser um `count(*)` de combinados ativos e passa a **somar**, por combinado ativo, **1** (simples) ou o **número de ocorrências ainda não pagas** (recorrente). A capacidade de **agenda** (H11.4) **não** muda: o combinado recorrente é **uma anotação só** (uma linha de combinado). Isso mantém o custo de envio limitado por construção (vagas × custo por envio fica abaixo do preço do plano).
- [ ] Ao tentar ativar **além do permitido** (free, ou plano sem vaga de aviso ativo livre), a API recusa com envelope `{ error: { code, message } }` e o front mostra a **CTA de upgrade** (H11.6), mantendo o item na agenda.
- [ ] A contagem é **por conta** (isolamento por usuário, ver Épico 9 H9.8) e validada **no servidor** (H11.8), nunca só no front.

---

### H11.4: Limite de capacidade de agenda 🟢
Como **sistema**, quero limitar quantas anotações cada conta mantém na agenda, conforme o plano, para a agenda não virar um depósito infinito.
*Critérios de aceite:*
- [ ] A **capacidade de agenda é um balde único**: **toda** anotação conta igual para esse teto (ativa, pausada ou só anotação `sem_aviso`); não há sub-balde de "agenda" vs "ativos" na contagem de **capacidade**. (O teto de **vagas de aviso ativo** da H11.3 é uma alavanca **à parte**: limita quantas dessas anotações ficam **ativas enviando ao mesmo tempo**, não a capacidade total. A conta pode anotar mais do que envia.)
- [ ] **Um item ativado continua ocupando seu lugar na agenda** (ativar não libera o slot, é a mesma anotação).
- [ ] Valores por plano (capacidade de agenda): **Free 25**, **Start 100**, **Profissional 250**, **Plus 10 por envio contratado** (ex.: 50 envios → 500 anotações; 26 → 260, acima do Profissional).
- [ ] Ao atingir a capacidade, criar nova anotação é recusado no servidor com CTA de upgrade, sem apagar nada do que já existe.
- [ ] **Anotações em estado terminal** (`pago`/`cancelado`/`recusado`/`expirado`) **continuam contando**: a agenda registra o que aconteceu, como uma agenda de verdade. O **sistema nunca remove sozinho**.
- [ ] **Só o usuário** pode tirar algo da agenda, por ação manual. Como há a regra de não-DELETE de negócio (auditoria append-only), "excluir da agenda" é **arquivamento** (sai da contagem/visão da agenda), **não** um DELETE físico do registro. *Ver divergência.*
- [ ] A contagem é por conta e validada no servidor (H11.8).

---

### H11.5: Recursos por plano (recorrência, cadência, menu, confirmação, totais) 🟢 / 🟡
Como **sistema**, quero ligar/desligar recursos conforme o plano, para diferenciar o free e o pago e sustentar a monetização.
*Critérios de aceite:*
- [ ] **Recorrência** (combinado com N ocorrências, Épico 6 H6.10 / Épico 8 H8.7) **NÃO é recurso/diferencial de plano**: é um **facilitador** para registrar de uma vez vários avisos do mesmo cliente. Disponível para **todos** os planos; não é gated nem entra como vantagem nos cartões. O que limita é o **custo por ocorrência** (cada ocorrência reserva 1 vaga, abaixo) e a regra geral do free (free monta na agenda, mas não envia).
- [ ] **Custo de vaga da recorrência (cada ocorrência reserva 1 vaga):** um combinado recorrente de **N ocorrências reserva N vagas de aviso ativo** no momento da ativação (cada ocorrência é um "envio de aviso", a moeda do plano). Conforme cada ocorrência é confirmada (`pago`), a vaga é **liberada**; a contagem soma as ocorrências **ainda não pagas**. **Não há cota de "recorrentes inclusos"**: a recorrência é metrificada por ocorrência, o que mantém o custo de envio **limitado por construção** (vagas × custo por envio < preço do plano: ex.: Profissional 25 × R$0,53 = R$13,25 < R$23,90; Plus topo 200 × R$0,53 = R$106 < R$140). O teto duro de ocorrências por combinado é técnico (trava de outbox), não comercial.
- [ ] **Cadência configurável** (Épico 6 H6.10): o **cobrador escolhe quais D-avisos** do ciclo são enviados (quais dias do D-2 a D+1); o **devedor do fluxo invertido** também pode configurar como quer receber as notificações. **Free e Start NÃO têm** essa opção (usam a cadência padrão); **Profissional e Plus** têm.
- [ ] **Menu de texto livre** ao devedor (Épico 7 H7.1): habilitado nos planos pagos, **silêncio** no free.
- [ ] **Confirmação de pagamento / `informado_pago`** (Épico 8): como o **free não ativa avisos**, ele **não recebe `informado_pago`** (não há devedor confirmando pagamento de um aviso que ele nem disparou). Como **devedor** de um aviso de outra conta, um usuário free só recebe o que decorre de ser devedor (lembretes, aviso de "pagamento informado/confirmado pelo cobrador"). O ciclo de confirmação como cobrador exige plano que ative envio.
- [ ] **Totais por período** (consolidação do painel: somar a receber / recebido / a pagar / pago num intervalo de datas) é **base, em TODOS os planos** (Free incluso). É table-stakes, não diferencial, e não entra na lista de vantagens dos planos.
- [ ] **Histórico completo / múltiplos clientes** (Épico 9) seguem como recurso de plano pago; no free o painel mostra o básico fora a consolidação por período.
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
- [ ] 🟡 Trocar de plano **fixa a versão corrente** do plano novo (congelamento por assinatura, H11.12); o vínculo anterior não é alterado retroativamente.
- [ ] 🟡 Depende do billing real (H11.7); fora do MVP.

---

### H11.10: Tela de planos do usuário (ver, escolher, trocar) 🟢
Como **pessoa usuária**, quero uma área "Plano" no menu (fora da Conta) onde vejo os planos e meu uso, para escolher ou trocar de plano quando quiser.
*Critérios de aceite:*
- [ ] Existe um item **"Plano"** no menu do usuário, **separado da Conta**, que abre a tela de planos.
- [ ] A tela mostra os **4 planos** (Free, Start, Profissional, Plus) com preço, limites e recursos, e o **uso atual da agenda** vs a capacidade do plano vigente (espelho do backend, H11.8).
- [ ] Posso **escolher/trocar** de plano por ali; no Plus, escolho o **volume de envios** (H11.3). No MVP a troca é **stub trial** (cortesia, sem dinheiro); a mecânica de billing real (upgrade/downgrade pagos) segue na **H11.9 (🟡)**.
- [ ] O plano vigente aparece marcado como **"plano atual"**; a tela nunca destrói trabalho (nada é apagado ao trocar).
- [ ] A área também é alcançável pelas CTAs de upgrade (H11.6) e pelo banner de assinatura.

---

### H11.11: Gestão do catálogo pelo owner 🟢
Como **owner**, quero editar cada plano pela tela de admin, para ajustar preço, limites e recursos sem precisar de migration a cada mudança comercial.
*Critérios de aceite:*
- [ ] Em `/admin/planos`, o owner edita por plano: **preço** (e, no Plus, piso/topo da curva), **limites** (capacidade de agenda, vagas de aviso ativo, faixa de envios do Plus, reengajamento) e os **liga/desliga de recurso** (recorrência, cadência, menu, confirmação, totais, somente leitura).
- [ ] A edição **cria uma nova versão** do plano e vale **só para novas contratações**: o catálogo mostrado a quem ainda vai assinar (H11.1/H11.10) passa a refletir a nova versão, mas **assinaturas vigentes não mudam** (mantêm a versão contratada, ver H11.12).
- [ ] A edição é **validada no servidor** e restrita ao **owner**; outra pessoa recebe recusa com envelope `{ error: { code, message } }`. Valores inválidos (preço negativo, topo menor que o piso, faixa de envios invertida) são recusados.
- [ ] O owner **não cria nem apaga** planos: as 4 chaves (`free`/`start`/`profissional`/`plus`) são estáveis; só os valores mudam.
- [ ] **Assinaturas já contratadas mantêm a versão contratada**: preço, **limites E recursos** congelados no momento da contratação (não só o preço, ver H11.12). A edição do owner **nunca** as altera retroativamente.
- [ ] A linguagem da tela respeita as Regras de Ouro (sem "dívida/cobrança", gênero neutro, sem travessão).

---

### H11.12: Versionamento do catálogo e congelamento por assinatura 🟢
Como **pessoa que paga por um plano**, quero manter o preço, os limites e os recursos que contratei, para que mudanças no catálogo não me afetem retroativamente (o produto já está em produção, com clientes pagantes).
*Critérios de aceite:*
- [ ] O catálogo é **versionado**: cada edição do owner (H11.11) gera uma **nova versão** do plano; as versões anteriores são **preservadas** (append-only, regra de não-DELETE).
- [ ] Cada assinatura **fixa a versão contratada** (preço + todos os limites + todos os recursos). Enquanto a assinatura vigora, as alavancas efetivas vêm **dessa versão**, nunca do catálogo corrente.
- [ ] Editar o catálogo vale **só para novas contratações**: quem já assinou não muda; quem assinar depois pega a **versão corrente**.
- [ ] **No vencimento** do período contratado, a assinatura passa a apontar para a **versão corrente** do mesmo plano (o cliente entra no plano novo na renovação). 🟡 O disparo automático da renovação depende do **billing real** (H11.7); a regra "no vencimento adota a corrente" já fica modelada (a chave da assinatura aponta para o plano corrente).
- [ ] **Trocar de plano** (H11.10 / H11.9) fixa a **versão corrente** do plano escolhido no momento da troca (novo congelamento).
- [ ] O **free acompanha a versão corrente** (não fixa versão): não é pago e não tem vencimento, então melhorias do free chegam a todos. O congelamento por versão protege os **planos pagos**.
- [ ] A resolução das alavancas é **no servidor** (H11.8), a partir da **versão fixada** da assinatura (ponto único), nunca do catálogo ao vivo para uma conta paga vigente.

---

### Divergências com a definição atual (precisam de refatoração)

> O catálogo de planos do **PROJETO.md** (seção 8) e o que os épicos foram decidindo **não batem**. As histórias são a fonte de verdade: o catálogo precisa ser reescrito para o modelo abaixo.

- **Modelo de planos:** PROJETO.md descreve "pessoal R$ 9,90 (até 5 avisos)" e "profissional R$ 29/49". As histórias decidiram **4 planos: Free, Start, Profissional, Plus**, com **dois eixos**: a **capacidade de agenda como balde único** (Free 25 / Start 100 / Profissional 250 / Plus 10 por envio) e o teto de **vagas de aviso ativo** (vendido como "envios de aviso": Free 0 / Start 10 / Profissional 25 / Plus 26 a 200). PROJETO.md seção 8 precisa ser reescrito para este modelo. **Preços decididos** (ver Decisões).
- **Free passa a manter agenda:** hoje o free "só visualiza" (Épico 1 H1.5 / Épico 2). Com o modo agenda (Épico 4), o free **cria item de agenda** mas **não ativa**. Refatorar a regra de plano para distinguir "criar agenda" de "ativar/enviar".
- **Limites no servidor a partir do catálogo:** se hoje há limite fixado em código, mover para leitura do catálogo (H11.1) em migration.
- **`informado_pago` / cadência / recorrência como recurso de plano:** amarrar esses recursos ao plano exige um ponto único que consulta as alavancas do catálogo; verificar se a checagem hoje existe e onde.
- **"Excluir da agenda" manual = arquivar, não DELETE:** o usuário pode tirar uma anotação da agenda (libera o slot do limite), mas pela regra de não-DELETE de negócio (Épico 4 H4.4 / CLAUDE.md) isso é um **arquivamento** (estado/flag que some da visão e da contagem), nunca um DELETE físico. Precisa de um estado/flag de "arquivado na agenda" a modelar; verificar se hoje existe.

### Decisões tomadas
- **Quatro planos:** **Free, Start, Profissional, Plus** (este vendido por volume de envios).
- **Dois eixos por plano:** **capacidade de agenda** (quantas anotações a conta mantém) e **vagas de aviso ativo** (quantos combinados ficam ativos enviando ao mesmo tempo, vendidas como "envios de aviso"). Os dois são alavancas separadas: a conta pode anotar mais do que envia.
- **Vagas de aviso ativo ("envios de aviso") = eixo comercial:** **Free 0, Start 10, Profissional 25, Plus 26 a 200** (contínuo: o Plus começa onde o Profissional termina). Imposto no servidor (`exigirVagaDeAtivo`, H11.8).
- **Agenda é balde único:** tudo é anotação (ativo, pausado ou só anotação contam igual). Capacidade: **Free 25, Start 100, Profissional 250, Plus 10 por envio contratado**. Item ativado **continua ocupando** seu lugar na agenda.
- **Free = agenda + visualização, sem ativar.** Free não dispara nada e, por isso, **não recebe `informado_pago`** como cobrador.
- **Plus por volume de envios:** cada envio contratado vale **1 vaga de aviso ativo** e **10 anotações de agenda** (vagas 1:1 com os envios; agenda 10x). Profissional: agenda **250** (decisão 2026-06-25, migration 0056).
- **`pausado` ocupa vaga** (segue vivo, só não dispara).
- **Cadência configurável** (escolher quais D-avisos / como o devedor invertido recebe): só **Profissional e Plus**; Free e Start usam a padrão.
- **Recorrência = facilitador, não diferencial (decisão 2026-06-25):** recorrência **não é vendida por plano** nem gated; é um atalho para registrar vários avisos do mesmo cliente, disponível para **todos**. **Cada ocorrência reserva 1 vaga de aviso ativo** (cada ocorrência é um "envio de aviso"); um recorrente de N reserva N vagas, liberadas conforme cada ocorrência vira `pago`. **Sem cota de "recorrentes inclusos"** (a ideia inicial de inclusos com N livre foi descartada: subfaturava, pois "vaga" mede carga simultânea e o custo de envio é cumulativo, ex.: 5 inclusos × 12 ocorrências = 60 envios > preço do plano). A contagem de vagas passa a **somar** 1 (simples) ou ocorrências-não-pagas (recorrente). **Não usa `permite_recorrente` como porteiro** (o catálogo passa a ter `permite_recorrente = true` em todos os planos); o que limita é a vaga por ocorrência e a regra geral do free (agenda sim, envio não). Mantém custo < preço por construção. **Cadência configurável continua diferencial pago** (Prof/Plus), é outra alavanca.
- **Reengajamento manual pós-ciclo** (H8.3): até **3 envios por combinado**, nunca dois no mesmo dia.
- **`informado_pago` e dados do free persistem:** os dados ficam no banco normalmente (mesmo sem conta criada), pois são base para a agenda/combinados do cobrador; se a conta vier a ativar depois, nada se perde.
- **Downgrade com excedente: mantém ativo** o que existe; só trava criar/ativar novos até voltar abaixo do limite.
- **Preços (reprecificação 2026-06-25, migration 0052):** Free R$ 0, Start R$ 9,90 (10 envios, R$ 0,990/envio), Profissional **R$ 23,90** (25 envios, R$ 0,956/envio), Plus por volume de envios (curva linear no total): piso **26 envios = R$ 24,00** (R$ 0,923/envio) ao topo **200 envios = R$ 140,00** (R$ 0,70/envio). **A escada do R$/envio só cai** conforme se sobe de plano (0,990 > 0,956 > 0,923 ... 0,700), corrigindo a inversão anterior em que o Profissional custava mais por envio que o Start. Regra de margem: cobrar **no mínimo R$ 0,70/envio** (custo R$ 0,53 no pior caso; lucro mínimo R$ 0,17/envio com a conta cheia); o piso da tabela é exatamente R$ 0,70 no topo do Plus. O Plus é parametrizado no catálogo por piso e topo, e o total intermediário é calculado por uma função única (`precoPorEnvioCentavos`). Seed inicial: migrations 0026/0049; reprecificação deliberada do owner: **0052** (aplicada in place, pré-versionamento da H11.12; assinaturas pagas mantêm o preço congelado, não tocadas; o free acompanha a versão corrente).
- **Totais por período é base (não diferencial):** a consolidação do painel por intervalo de datas está em **todos** os planos (Free incluso); saiu da lista de vantagens dos cartões (landing e painel do dono). A coluna `totais_periodo` segue no catálogo, agora uniforme = true (migration 0050). Decisão 2026-06-25.
- **Anotações em estado terminal continuam contando** na agenda (a agenda registra o que aconteceu). O sistema nunca remove sozinho; só o usuário, manualmente (arquivamento, não DELETE físico).
- **Validação no servidor** (defesa em profundidade): o front só antecipa; API+banco decidem.
- **MVP = stub trial:** limites valem, cobrança em dinheiro é futura.
- **Catálogo versionado + congelamento por assinatura (decisão 2026-06-25, produção):** o owner edita o catálogo pela tela (H11.11), mas como há **clientes pagantes em produção**, editar **não pode** alterar quem já paga. Por isso o catálogo é **versionado**: cada edição cria uma **nova versão** do plano (append-only, regra de não-DELETE); cada assinatura **fixa a versão contratada** (preço + limites + recursos). Edições valem **só para novas contratações**; **no vencimento** a assinatura adota a versão corrente; o **free acompanha a corrente** (não paga, não vence). Substitui a decisão anterior ("owner é fonte da verdade em runtime, aplica para todos"), que afetaria clientes existentes. Detalhe em H11.12.
- **Duas telas de plano (decisão 2026-06-25):** o **usuário** tem uma área "Plano" no menu (fora da Conta) para ver/escolher/trocar (H11.10); o **owner** tem `/admin/planos` como tela de **gestão** editável (H11.11). São telas distintas com propósitos distintos.
- **Expiração de convite (7 dias) é fixa** e **não** é alavanca de plano (Épico 5 H5.7): não entra no catálogo.

### Decisões em aberto
- Nenhuma pendente neste épico.

### Fora de escopo deste épico
- ❌ Gateway de pagamento, faturas, assinatura recorrente, dunning (billing real, 🟡).
- ❌ Textos finais das CTAs de upgrade (entram com o épico de Templates/mensagens e o design do painel).
- ❌ Mecânica de cada recurso em si (recorrência, cadência, menu): definida nos épicos 6, 7 e 8; aqui só o **liga/desliga por plano**.
- ❌ Limites de envio do WhatsApp/Baileys que afetam a operação (capacidade do canal): é restrição operacional do transporte (Épico 10), não alavanca comercial de plano.
