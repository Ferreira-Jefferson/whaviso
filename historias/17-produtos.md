# Épico 17: Produtos / Catálogo (mini-estoque de itens de venda)

> O pilar **Controlar** ganha um **catálogo de produtos** reutilizável, para quem trabalha com venda direta não redigitar o mesmo item toda vez que monta um combinado. Um produto é só **nome + preço de venda**: o mínimo para reaproveitar num pedido. Não é estoque com quantidade, nem tem custo, nem categoria (decisão do dono: custo por produto tem variáveis demais para valer a pena; categoria vive no combinado, Épico 16).
> **Produto é dado INTERNO do dono da conta.** Nunca aparece em nenhuma mensagem ao devedor (Regras de Ouro intactas): o que vai ao devedor é o combinado (motivo, valor, data), nunca o catálogo. O produto só alimenta a composição do pedido (`itens` do combinado, Épico 2/3), que também é interna.
> **Preço congelado (decisão de negócio central):** cada item do combinado guarda um **snapshot** do nome e do preço no momento em que foi criado. Editar o produto no catálogo depois **não** mexe no valor de combinados que já existem; só vale para combinados **novos**. A única propagação para o passado é o **nome** (correção de rótulo), nunca o preço.
> Convenções de sempre: sem travessão, sem palavras proibidas (nada de "dívida/cobrança/atraso/inadimplência", inclusive nos nomes de produto), neutras quanto a gênero; dinheiro em **centavos** (exibido em reais); datas em America/Sao_Paulo. Só leitura do banco + solicitação de ações (Épico 9 H9.8): nada é calculado no front.

---

### H17.1: Criar um produto 🟢 `[+]`
Como **usuário com conta**, quero cadastrar um produto com um nome e um preço de venda, para reaproveitá-lo ao montar combinados.
*Critérios de aceite:*
- [ ] Informo um **nome** (1 a 80 caracteres) e um **preço de venda** em reais (guardado em **centavos**, inteiro `>= 0`).
- [ ] O produto pertence **só à minha conta** (isolamento por `profile.id`); nunca é compartilhado nem visível a outra conta.
- [ ] **Nome único por conta** entre os produtos não arquivados (comparação sem diferenciar maiúsculas/minúsculas): criar dois "Batom vermelho" recusa com erro claro do envelope `{ error: { code, message } }`.
- [ ] A criação é livre (não consome crédito): catálogo é organização, não envio.
- [ ] Posso criar um produto **tanto na área de Gestão** (aba Produtos, Épico 18) **quanto inline no fluxo de Novo combinado** (ao montar o pedido, Épicos 2/3), sem trocar de tela.

---

### H17.2: Listar, ver e editar produtos 🟢 `[+]`
Como **usuário com conta**, quero ver, abrir e editar meus produtos, para manter o catálogo em dia.
*Critérios de aceite:*
- [ ] Vejo meus produtos **não arquivados** (nome + preço de venda), ordenados por nome.
- [ ] Abrir um produto mostra seus dados **em modal** (sem navegar para outra tela), com opção de editar ali mesmo.
- [ ] Posso **renomear** o produto ou **trocar o preço de venda**.
- [ ] Renomear para um nome que já existe (ativo) recusa, como em H17.1.

---

### H17.3: Editar o NOME propaga; editar o PREÇO não 🟢 `[+]`
Como **usuário com conta**, quero que corrigir o nome de um produto conserte o rótulo nos combinados que já o usam, mas que mudar o preço só valha para combinados novos, para não reescrever o histórico de valores acordados.
*Critérios de aceite:*
- [ ] Editar o **nome** de um produto atualiza a **descrição** dos itens de combinados existentes que referenciam esse produto (propagação de rótulo), **escopada à minha conta**. Nada além da descrição muda.
- [ ] Editar o **preço de venda** de um produto **não** altera o valor de nenhum combinado já criado: cada item do combinado carrega o preço no momento em que foi criado (snapshot congelado). O novo preço só é sugerido em combinados **futuros**.
- [ ] Arquivar um produto **não** apaga nem altera nenhum combinado que o usou (o item do combinado é um snapshot independente).
- [ ] A propagação de nome roda **no servidor**, isolada por `profile.id`; nunca vaza entre contas.

---

### H17.4: Arquivar um produto 🟢 `[+]`
Como **usuário com conta**, quero tirar um produto que não vendo mais da lista de escolha, sem perder o histórico dos combinados que já o usaram.
*Critérios de aceite:*
- [ ] Posso **arquivar** um produto (soft-delete): ele sai da lista de escolha (catálogo e sugestões no Novo combinado), mas os combinados que já o referenciavam **não somem nem mudam de valor** (regra de não-DELETE; o snapshot no item é independente).
- [ ] Arquivar não apaga do banco (coerente com `categorias` e `chaves_pix`).
- [ ] Um produto arquivado pode ter seu nome ainda propagado a combinados antigos por uma edição de nome (o vínculo `produto_id` do item permanece), mas não aparece mais como opção nova.

---

### H17.5: Escolher um produto do catálogo ao montar o pedido 🟢 `[+]`
Como **criador (cobrador ou devedor)**, quero escolher um produto do catálogo ao montar os itens do combinado, para preencher descrição e preço sem redigitar.
*Critérios de aceite:*
- [ ] Ao montar o pedido (Épicos 2/3), o campo de descrição do item **sugere produtos do catálogo**. Escolher um preenche a **descrição** e o **preço unitário** do item e grava o vínculo `produto_id` (referência ao produto).
- [ ] Posso continuar digitando **texto livre** (sem escolher produto). **Ao REGISTRAR o combinado**, cada item de texto livre **vira ou reusa** um produto do catálogo (upsert por nome, case-insensitive, entre os ativos) e grava o `produto_id` no snapshot do item. Assim o cadastro de produto acontece nos **dois lugares** (aba Produtos e ao registrar um combinado) e o catálogo lista **tudo junto**. Produto novo nasce com o preço do item; produto já existente **não** tem o preço sobrescrito (o valor do combinado segue o snapshot do item).
- [ ] O preço vem do catálogo apenas como **ponto de partida**: posso ajustar o preço unitário daquele item sem alterar o produto no catálogo (o valor do combinado é sempre o snapshot dos itens).
- [ ] O vínculo `produto_id` é **interno** (nunca vai ao devedor); serve só para a propagação de nome (H17.3) e para relatórios futuros.

---

### Decisões tomadas
- **Produto = só nome (1..80) + preço de venda (centavos, >= 0)**, isolado por conta. Sem custo, sem categoria, sem quantidade em estoque (decisão do dono: manter o mínimo útil).
- **Nome único por conta** entre os ativos (case-insensitive), como `categorias`.
- **Snapshot congelado no item do combinado:** o item guarda `descricao` + `valor_unit_centavos` copiados na criação, mais um `produto_id` opcional só como vínculo. Editar o produto **não** recalcula combinados existentes.
- **Nome propaga, preço não:** editar o nome reescreve a `descricao` dos itens com aquele `produto_id` (correção de rótulo); editar o preço vale só para combinados novos.
- **Arquivar, nunca apagar** (soft-delete `arquivado`), coerente com a regra de não-DELETE. **Exceção de engenharia:** o produto é catálogo/configuração como `templates`? Não; segue a regra de não-DELETE de negócio (só soft-delete).
- **Criável de dois lugares, listado junto:** aba Produtos (Gestão, Épico 18) e ao **registrar um combinado** (revisado 2026-07-17: cada item vira/reusa um produto por upsert de nome, gravando `produto_id`). Motivo: se você já digitou os itens nos combinados, eles devem aparecer no catálogo sem recadastrar. O snapshot do item continua congelado; o catálogo é só o rótulo + preço de partida.
- **Nunca vaza para o devedor:** produto e `itens` são organização interna do dono.

### Fora de escopo deste épico
- ❌ Custo por produto e margem por produto (decisão do dono: variáveis demais; o custo, quando existir, é do combinado, Fase A do Épico 18).
- ❌ Categoria por produto (categoria é do combinado, Épico 16).
- ❌ Estoque com quantidade/baixa automática, variações (tamanho/cor), SKU, código de barras.
- ❌ Catálogo compartilhado entre contas ou sugerido pelo produto.
- ❌ Recalcular combinados existentes ao mudar o preço do produto (o snapshot é imutável por decisão).
