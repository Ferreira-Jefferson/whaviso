# Épico 15: Combinados por pessoa (visão de contato)

> O pilar **Controlar** olhado por uma lente nova: em vez de "todos os meus combinados" (Épico 9, painel), **todos os meus combinados com uma mesma pessoa**, com os totais daquela relação e um atalho para começar um novo combinado com ela.
> **Não existe cadastro de contatos.** A "pessoa" é a **outra ponta** de um combinado (o devedor quando sou cobrador; o cobrador quando sou devedor, no fluxo invertido). A **identidade da pessoa é o telefone** (E.164) da outra ponta: dois combinados são "da mesma pessoa" quando compartilham esse telefone, **mesmo que o nome esteja diferente** em cada um. O nome é só **rótulo** de exibição, nunca a chave.
> Esta visão é **só leitura do banco + solicitação de ações** (Épico 9 H9.8): nenhuma regra de negócio nem cálculo de totais roda no front. Criar um combinado a partir daqui segue **integralmente** as regras dos Épicos 2 (receber) e 3 (pagar invertido), incluindo saldo de créditos (Épico 11).
> **UX:** a tela **reaproveita** os componentes do painel (Épico 9) e do formulário de criar (Épicos 2/3), tokens e componentes de `@/shared/ui`, adicionando só o que a visão por pessoa exige (agrupamento por nome, autocomplete de pessoa na criação).
> Convenções de sempre: sem travessão, sem palavras proibidas (nada de "dívida/cobrança/atraso/inadimplência", **inclusive nos rótulos e totais**), **neutras quanto a gênero**; dinheiro vem de **centavos** e é exibido em reais; datas em **America/Sao_Paulo**.
> **Segurança (Épico 13 H13.8):** o telefone é dado sensível e **nunca** pode aparecer em URL, query string ou log (a redaction por campo do logger não cobre `req.url`). Por isso a pessoa é referenciada por um **id de combinado (UUID)** que o usuário já possui, e as buscas que carregam telefone vão pelo **corpo** de um POST (o Fastify não loga corpo nem resposta por padrão). O telefone só trafega no corpo das respostas (para exibição a quem é dono do dado) e nas máscaras de tela.

---

### H15.1: Abrir a visão de uma pessoa, identidade pelo número 🟢 `[+]`
Como **usuário com conta**, quero abrir "ver tudo com esta pessoa" e ver todos os combinados daquele número, para reunir num só lugar o histórico com aquela pessoa mesmo que o nome tenha variado.
*Critérios de aceite:*
- [ ] Há acesso a uma **tela de detalhe da pessoa** a partir de: (a) um item da lista de combinados (painel, Épico 9), (b) o detalhe de um combinado (H9.4) e (c) a busca por nome (H15.4).
- [ ] A rota da tela carrega **apenas o id (UUID) de um combinado** com aquela pessoa, nunca o telefone (H13.8). A API resolve, no servidor, o **telefone da outra ponta** daquele combinado e agrega por ele.
- [ ] A "pessoa" é a **outra ponta**: o **devedor** nos combinados em que sou cobrador, e o **cobrador** nos combinados em que sou devedor (invertido).
- [ ] **A identidade é o telefone, não o nome:** selecionar qualquer combinado/nome de um número mostra **todos** os meus combinados com aquele número, **inclusive os que têm nome diferente**.
- [ ] O cabeçalho da tela mostra o **nome pelo qual cheguei** (o nome do combinado/entrada) como título e o **número (formatado)** como identidade estável. O número é dado do próprio dono (mesma exposição do detalhe do combinado); nunca vai em rota/log (H15.7). As variações de nome aparecem nos grupos da lista (H15.3).
- [ ] Combinados que **ainda não têm telefone da outra ponta** (ex.: anotações de agenda `sem_aviso` antes de ativar, Épico 4) **não** têm chave de pessoa e **não** aparecem nesta visão; o acesso "Ver tudo com esta pessoa" fica indisponível para eles até que o telefone exista.
- [ ] **Isolamento por usuário:** a visão só considera **os meus** combinados (por `profile.id`); nunca cruza dados entre contas.

---

### H15.2: Ver os totais dos quatro lados com aquela pessoa 🟢 `[+]`
Como **usuário com conta**, quero ver a soma do que essa relação representa, para entender minha posição com aquele número num relance.
*Critérios de aceite:*
- [ ] A tela mostra, para aquele número, os **quatro totais** em quantidade e soma (em R$), calculados no **backend** a partir do estado e do valor (centavos):
  - **A receber**: combinados em que sou **cobrador** dela e que estão **ativos não pagos** (mesmo conjunto de estados do painel, `ATIVOS_NAO_PAGOS`).
  - **Recebido**: combinados em que sou **cobrador** dela e estão **`pago`**.
  - **A pagar**: combinados em que sou **devedor** dela e estão **ativos não pagos**.
  - **Pago**: combinados em que sou **devedor** dela e estão **`pago`**.
- [ ] Os totais somam **todos os combinados do número**, independentemente do nome registrado em cada um (identidade pelo telefone, H15.1).
- [ ] Um mesmo número pode aparecer nos dois papéis (às vezes recebo, às vezes pago); cada combinado entra no total do **meu papel naquele combinado**.
- [ ] Combinados em estado **terminal não pago** (`cancelado`, `recusado`, `expirado`) **não** entram em nenhum dos quatro totais (aparecem só no histórico da lista, H15.3), igual ao painel (H9.2).
- [ ] Os totais seguem as convenções do painel (Épico 9): calculados no servidor, nunca somados no front; rótulos sem termos proibidos e neutros quanto a gênero.
- [ ] A soma é **coerente com o painel**: os totais desta pessoa são um recorte (por telefone da outra ponta) dos mesmos totais por papel que o painel mostra no geral.

---

### H15.3: Ver todos os combinados com aquele número, agrupados por nome 🟢 `[+]`
Como **usuário com conta**, quero a lista de todos os combinados daquele número, agrupada por nome, para reconhecer cada relação mesmo quando o nome variou.
*Critérios de aceite:*
- [ ] A lista traz **todos os meus combinados** com aquele número (os que compartilham o telefone da outra ponta), independentemente do meu papel em cada um.
- [ ] A lista é **agrupada por nome**: cada nome distinto registrado para aquele número vira um **subgrupo** com seus combinados. Um mesmo número com "Ana" e "Ana Paula" mostra dois grupos.
- [ ] **Cada item exibe o nome que foi registrado no próprio combinado** (não um nome único derivado); além disso mostra papel (recebo/pago), motivo, valor (em reais), data combinada e **estado atual** com rótulo claro; e leva ao **detalhe do combinado** (H9.4).
- [ ] Dentro de cada grupo, a lista separa **ativos** de **histórico** (terminais não pagos + `pago`), sem poluir a visão ativa, como no painel (H9.3).
- [ ] A ordenação padrão é por **data combinada** (mais recente/próxima em destaque), com desempate estável.
- [ ] **Nada é recalculado no front:** a lista e o agrupamento refletem o que a API serve; a máquina de estados e os totais vivem no servidor (H9.8).

---

### H15.4: Encontrar a pessoa pesquisando por nome 🟢 `[+]`
Como **usuário com conta**, quero pesquisar por nome no painel e chegar à visão daquele número, para achar a relação sem lembrar de um combinado específico.
*Critérios de aceite:*
- [ ] A **busca por nome** do painel (server-side, ILIKE, H9.3) reaproveita-se como entrada: ela filtra a lista de combinados por nome da outra ponta, e cada item traz o atalho "Ver tudo com esta pessoa" (H15.1).
- [ ] Selecionar o atalho abre a **visão da pessoa** (H15.1) daquele **número**, trazendo **todos** os combinados dele, inclusive os de nome diferente (a identidade é o número, não o nome buscado).
- [ ] A busca por **nome** pode ir na query (nome não está na lista de campos sensíveis do logger, e já é buscável no painel); buscas que carregam **telefone** seguem a regra do POST-no-corpo (H15.7).

---

### H15.5: Começar um novo combinado com aquela pessoa 🟢 `[+]`
Como **usuário com conta**, quero criar um novo combinado com aquele número direto da tela da pessoa, para não redigitar nome e telefone.
*Critérios de aceite:*
- [ ] A tela tem uma ação em destaque **"Novo combinado"** que abre a criação (Épico 2/3) já **pré-preenchendo** o **número** e o **nome** (o nome de entrada, H15.1).
- [ ] O usuário ainda escolhe a **direção** (vou receber / vou pagar) e preenche o resto (motivo, valor, data, Pix quando aplicável); o pré-preenchimento **não** pula nenhuma validação nem etapa da criação.
- [ ] A criação passa **integralmente** pelas regras de origem: gates de saldo de créditos (Épico 11), Pix obrigatório conforme o fluxo (Épicos 2/3/14), envio do combinado para aceite (Épico 5). Esta tela **só facilita o preenchimento**, não cria regra nova.
- [ ] Se a criação falhar (ex.: saldo insuficiente), o erro do envelope `{ error: { code, message } }` aparece sem travar a tela, como na criação normal.
- [ ] Após criar, a visão da pessoa **relê** do banco e o novo combinado passa a contar nos totais (H15.2) e na lista (H15.3).

---

### H15.6: Autocomplete de pessoa ao criar um combinado 🟢 `[+]`
Como **usuário com conta**, quero que ao digitar o número no formulário de criar apareçam pessoas que já usei com aquele número, para reaproveitar nome e número sem redigitar.
*Critérios de aceite:*
- [ ] No formulário de **criar combinado** (Épicos 2/3), ao digitar o **6º dígito** do número em diante, aparece uma **lista de correspondências**: nomes/números **já usados em combinados que eu criei** e cujo **número bate** com o que estou digitando (correspondência por prefixo dos dígitos).
- [ ] O escopo é **só os combinados do próprio criador** (isolamento por `profile.id`); nunca sugere pessoas de outra conta.
- [ ] Cada sugestão mostra **nome** e **número**; selecionar uma **preenche** o nome e o número no formulário. O usuário pode ignorar as sugestões e digitar livremente.
- [ ] A busca do autocomplete carrega dígitos de telefone, então vai por **POST com os dígitos no corpo** (nunca em query/URL); a resposta traz `{ nome, telefone }` e **não** é logada (H15.7).
- [ ] A lista some/atualiza conforme o usuário continua digitando; abaixo de 6 dígitos, não dispara (evita correspondência ampla demais e chamadas desnecessárias).
- [ ] O autocomplete é uma **conveniência de preenchimento**: não altera nenhuma regra de criação (Épicos 2/3/11) nem cria vínculo por si só; o vínculo nasce do combinado criado, como sempre.

---

### H15.7: Referência por combinado, telefone só no servidor e no corpo 🟢 `[+]`
Como **sistema (api + front)**, quero que a visão por pessoa não exponha o telefone em rota nem em log, para respeitar o compliance de dados sensíveis.
*Critérios de aceite:*
- [ ] A rota da tela da pessoa e os endpoints de leitura recebem o **id (UUID) de um combinado** do usuário; a API deriva o telefone da outra ponta **no servidor** (H13.8). Telefone **nunca** em parâmetro de caminho ou query.
- [ ] A busca do autocomplete (H15.6), por carregar dígitos de telefone, é um **POST com o número no corpo**; corpo e resposta **não** são logados (o Fastify não loga corpo/resposta por padrão; a redaction por campo cobre o resto).
- [ ] O telefone da pessoa **não** é logado em nenhum ponto; segue aparecendo só no **corpo** das respostas, para exibição a quem é dono do dado.
- [ ] O agrupamento por telefone da outra ponta e o agrupamento por nome rodam **no banco/servidor** (isolado por `profile.id`), nunca no cliente.
- [ ] A visão é **só leitura + solicitação** (H9.8): não muda estado por conta própria; toda ação (criar, e as ações por combinado) é pedida à API, validada e gravada, e a tela relê.

---

### H15.8: Lista central de clientes e editar o nome em modal 🟢 `[+]`
Como **usuário com conta**, quero uma lista de todos os meus clientes e poder editar o nome de um deles ali mesmo, sem navegar para outra tela, para gerir contatos de forma leve (a tela de detalhe por página é vista como burocrática).
*Critérios de aceite:*
- [ ] Há uma **lista central de clientes** (a outra ponta dos meus combinados, identidade pelo telefone, H15.1), agregada por número: nome mais recente daquele número, telefone **mascarado** na tela, e os quatro totais da relação (H15.2). Vive na área de Gestão (Épico 18, aba Clientes).
- [ ] A lista roda no **servidor** (H9.8), isolada por `profile.id`, e cada cliente é referenciado por um **id de combinado representativo** (nunca pelo telefone em rota/log, H15.7).
- [ ] Abrir um cliente mostra os detalhes **em modal** (totais + combinados agrupados por nome, H15.2/H15.3), sem trocar de página. A página por deep-link (`/pessoa/:avisoId`) **permanece** para os acessos existentes.
- [ ] Posso **editar o nome** do cliente no modal. Salvar atualiza o `nome_devedor` de **todos os meus combinados daquele telefone** em que sou cobrador, resolvendo o telefone **no servidor** a partir do id de combinado (nunca telefone em rota/log).
- [ ] A edição do nome é **livre** (dado interno de exibição; não abre reaprovação nem toca no acordo com a outra ponta) e **escopada à minha conta** (nunca renomeia combinados de outra conta, mesmo que compartilhem o telefone).
- [ ] Como a identidade é o telefone e o nome é só rótulo (H15.1), renomear afeta o rótulo, nunca o agrupamento: os combinados continuam sendo "da mesma pessoa" pelo número.

---

### Decisões tomadas
- **Pessoa = outra ponta, identidade pelo telefone (E.164).** Sem tabela de contatos. O **nome é só rótulo**: selecionar qualquer nome de um número mostra todos os combinados daquele número, mesmo com nomes diferentes.
- **Lista central de clientes + edição do nome em modal (H15.8, 2026-07-16):** a gestão de clientes ganha uma lista (na área Gestão, Épico 18) e a edição do nome acontece em modal, propagando por telefone (escopada ao dono). Segue **sem tabela de contatos** (a identidade continua sendo o telefone); editar o nome só reescreve `nome_devedor` nos meus combinados daquele número.
- **Lista agrupada por nome**, e **cada combinado exibe o nome registrado nele** (não um nome único derivado).
- **Busca por nome** para chegar à pessoa (resolve para o número); a visão sempre reúne tudo do número.
- **Nova tela de detalhe da pessoa** (rota própria por id de combinado), acessível da lista/painel, do detalhe do combinado e da busca por nome. Não substitui o painel; é um recorte por pessoa.
- **Quatro totais** (a receber, recebido, a pagar, pago), cobrindo os dois papéis, coerentes com o painel (H9.2), calculados no backend.
- **Autocomplete na criação** (H15.6): ao 6º dígito, sugere nomes/números já usados pelo criador cujo número bate; conveniência de preenchimento, sem regra nova.
- **Referência por id de combinado (UUID), não por telefone; buscas com telefone via POST no corpo**, para não vazar telefone em URL/log (H13.8).
- **Criar reaproveita os Épicos 2/3** com pré-preenchimento; sem regra de negócio nova na criação.
- **UX reaproveita** os componentes do painel (Épico 9) e do formulário de criar (Épicos 2/3), adicionando só o agrupamento por nome e o autocomplete.
- **Combinados sem telefone (agenda `sem_aviso` antes de ativar) ficam fora** desta visão por não terem chave de pessoa.

### Decisões em aberto
- Nenhuma pendente para o comportamento. O **layout fino** (disposição dos quatro totais, dos grupos de nome e do CTA "Novo combinado") sai na implementação com o design system atual, reaproveitando componentes do painel.

### Fora de escopo deste épico
- ❌ Cadastro de contatos como **entidade própria** (não há tabela de contatos; a pessoa é derivada do telefone). Editar o **nome** (H15.8) não cria entidade: só reescreve `nome_devedor` nos meus combinados daquele número.
- ❌ Regras de criação de combinado (Épicos 2/3), aceite (Épico 5), ciclo (Épico 6), confirmação (Épico 8): esta visão só as **aciona**, não as redefine.
- ❌ Totais gerais e "precisa de você" do painel (Épico 9): aqui os totais são **por pessoa/número**.
- ❌ Créditos de envio e CTA de compra (Épico 11); edição de textos/rótulos pelo owner (Épico 12).
