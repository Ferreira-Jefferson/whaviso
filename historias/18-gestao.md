# Épico 18: Gestão (área com abas: Resultados, Clientes, Produtos, Categorias)

> O pilar **Controlar** ganha um endereço único: uma **área "Gestão"** com abas, reunindo o que hoje está espalhado (o "Resultado"/métricas e as categorias) e o que passa a existir (lista central de clientes, catálogo de produtos). É a materialização do "épico de métricas / Fase A" citado no Épico 16 mas nunca escrito: aqui ele ganha forma como uma das abas e recebe a regra de atribuição por categoria.
> **Só leitura do banco + solicitação de ações (Épico 9 H9.8):** nenhuma métrica nem total é calculado no front; a área reaproveita os componentes do painel (Épico 9), do formulário de criar (Épicos 2/3) e os tokens/componentes de `@/shared/ui`. As abas são navegação (camada de app), não módulos que se importam entre si.
> Convenções de sempre: sem travessão, sem palavras proibidas (nada de "dívida/cobrança/atraso/inadimplência", **inclusive em rótulos e totais**), neutras quanto a gênero; dinheiro em **centavos** (exibido em reais); datas em America/Sao_Paulo. Telefone é dado sensível: **nunca** em URL/query/log (Épico 13 H13.8, Épico 15 H15.7).

---

### H18.1: Uma área "Gestão" com abas 🟢 `[+]`
Como **usuário com conta**, quero um lugar único chamado "Gestão" com abas, para achar num só clique meus resultados, clientes, produtos e categorias.
*Critérios de aceite:*
- [ ] Há uma área **"Gestão"** no menu principal, com quatro abas: **Resultados**, **Clientes**, **Produtos** e **Categorias**.
- [ ] Cada aba tem seu próprio endereço (deep-link) e sobrevive a um refresh do navegador (a aba aberta continua aberta).
- [ ] A aba **Resultados** é a inicial da área (o que hoje é a tela "Resultado"/métricas, Fase A) e mostra os mesmos números que já mostrava.
- [ ] A antiga rota da tela "Resultado" e a antiga rota de "Categorias" **redirecionam** para as abas correspondentes de Gestão (nenhum link antigo quebra).
- [ ] A área é **só leitura + solicitação** (H9.8): toda ação (criar/editar produto, renomear cliente, criar/arquivar categoria) é pedida à API, validada e gravada, e a tela relê.

---

### H18.2: Aba Resultados (saúde do negócio) 🟢 `[+]`
Como **usuário com conta (papel cobrador)**, quero ver a saúde do meu negócio, para entender o que vendi, o que tenho a receber e como vai cada marca.
*Critérios de aceite:*
- [ ] A aba mostra, para o papel **cobrador** (o que vendo/recebo), no período escolhido: recebido, a receber, ticket médio, melhores clientes, quebra por categoria e clientes inativos (mesmos números do Épico 9 / painel, calculados no servidor).
- [ ] O **total geral** (recebido / a receber) é lido dos combinados **sem cruzar por categoria**, então bate com o painel e não infla.
- [ ] Tudo no servidor (H9.8), isolado por `profile.id`; telefone só no corpo das respostas (nunca em rota/log).

---

### H18.3: Métrica por categoria com atribuição integral (multi-categoria) 🟢 `[+]`
Como **usuário com conta**, quero a quebra por categoria mesmo quando um combinado tem **mais de uma** categoria, para ver cada marca separadamente sem me confundir com o total.
*Critérios de aceite:*
- [ ] Com o combinado podendo ter **várias categorias** (Épico 16 atualizado), a quebra por categoria usa **atribuição integral**: cada combinado soma o seu **valor cheio** em **cada** categoria a que pertence.
- [ ] Por isso os buckets por categoria **podem se sobrepor** e **não devem ser somados** para bater com o total geral: um combinado de R$ 100 em duas categorias aparece como R$ 100 em cada uma (soma dos buckets = R$ 200), enquanto o total geral continua R$ 100.
- [ ] A tela deixa claro (rótulo/nota) que a quebra por categoria é uma visão sobreposta, não uma divisão do total (para o usuário não estranhar que "não fecha").
- [ ] Combinados **sem categoria** aparecem num bucket "Sem categoria" (via ausência de vínculo).
- [ ] O **total geral** segue lido de `avisos` sem join com categorias, então permanece correto independentemente de quantas categorias cada combinado tenha.

---

### H18.4: Aba Clientes (lista central + ver/editar em modal) 🟢 `[+]`
Como **usuário com conta**, quero uma lista de todos os meus clientes e poder ver/editar cada um sem sair da tela, para gerir meus contatos sem a burocracia de navegar para outra página.
*Critérios de aceite:*
- [ ] A aba lista **os clientes** (a outra ponta dos meus combinados, identidade pelo telefone, Épico 15), agregando por número: nome mais recente, telefone **mascarado** na tela, e os quatro totais da relação.
- [ ] Abrir um cliente mostra os detalhes **em modal** (não navega para outra tela; resolve a queixa de a tela "Pessoa" ser burocrática por levar a outra página). O modal reaproveita o conteúdo da visão por pessoa (Épico 15): totais + combinados agrupados por nome.
- [ ] Posso **editar o nome** do cliente no modal; salvar propaga o novo nome para todos os meus combinados daquele telefone (Épico 15 atualizado, H15.8).
- [ ] O deep-link antigo da tela da pessoa (`/pessoa/:avisoId`) continua funcionando (a página não é removida; a lista/modal é a via nova).
- [ ] Telefone **nunca** em URL/query/log: a lista referencia cada cliente por um id de combinado representativo; edição resolve o telefone no servidor (Épico 15 H15.7).

---

### H18.5: Abas Produtos e Categorias 🟢 `[+]`
Como **usuário com conta**, quero gerenciar produtos e categorias dentro da mesma área de Gestão, para não caçar cada coisa num canto diferente do app.
*Critérios de aceite:*
- [ ] A aba **Produtos** é o catálogo do Épico 17 (listar/criar/editar/arquivar em modal).
- [ ] A aba **Categorias** é a gestão do Épico 16 (listar/criar/renomear/arquivar), agora dentro de Gestão em vez de tela própria.
- [ ] O link "Gerenciar categorias" do Novo combinado passa a apontar para a aba Categorias de Gestão.

---

### Decisões tomadas
- **Gestão = área com abas** (Resultados, Clientes, Produtos, Categorias), camada de navegação do app. As abas compõem páginas de módulos distintos; nenhum módulo importa outro (a barra de abas vive no `app/`, não num módulo).
- **Resultados** = a tela de métricas/Fase A já existente, promovida a aba inicial da área.
- **Atribuição integral por categoria** (H18.3): com multi-categoria, cada combinado soma o valor cheio em cada categoria; buckets podem se sobrepor e não somam ao total. O total geral é sempre lido sem join, então nunca infla.
- **Clientes = lista + modal** (H18.4), resolvendo a queixa de a tela "Pessoa" ser burocrática; a página por deep-link permanece.
- **Redirects preservados:** as rotas antigas de "Resultado" e "Categorias" redirecionam para as abas de Gestão.

### Fora de escopo deste épico
- ❌ Regras de criação/edição de combinado, categorias e produtos: vivem nos Épicos 2/3, 16 e 17; aqui só se **aciona**.
- ❌ Métricas por produto (margem/ticket por produto): produto não tem custo (Épico 17); fica para depois, se a prática pedir.
- ❌ Somar os buckets por categoria para "fechar" com o total (a atribuição integral é deliberadamente sobreposta).
- ❌ Créditos de envio e CTA de compra (Épico 11).
