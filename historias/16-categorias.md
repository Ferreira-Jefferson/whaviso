# Épico 16: Categorias (organização por marca/linha)

> O pilar **Controlar** ganha um eixo novo: **categorias definidas pelo usuário**, para quem trabalha com venda direta separar seus combinados por marca ou linha (ex.: "Natura", "Boticário", "Bijuterias") e filtrar do jeito que ajuda o negócio.
> **Categoria é organização interna do dono da conta.** Nunca aparece em nenhuma mensagem ao devedor (Regras de Ouro intactas): não vai no combinado enviado, nem nos lembretes.
> A "pessoa" (Épico 15) é a outra ponta; a **categoria** é um rótulo do próprio usuário aplicado ao combinado. São eixos independentes: um combinado tem uma pessoa e, opcionalmente, **uma ou mais** categorias (multi-seleção, atualizado 2026-07-16). Produto (Épico 17) **não** tem categoria: categoria é do combinado.
> Convenções de sempre: sem travessão, sem palavras proibidas (nada de "dívida/cobrança/atraso/inadimplência", inclusive nos rótulos), neutras quanto a gênero; dinheiro em centavos; datas em America/Sao_Paulo. Só leitura do banco + solicitação de ações (Épico 9 H9.8): nada é calculado no front.

---

### H16.1: Criar uma categoria 🟢 `[+]`
Como **usuário com conta**, quero criar categorias com um nome (e uma cor opcional), para organizar meus combinados por marca ou linha.
*Critérios de aceite:*
- [ ] Informo um **nome** (1 a 40 caracteres) e, opcionalmente, uma **cor** (hex `#RRGGBB`), para reconhecer a categoria de relance.
- [ ] A categoria pertence **só à minha conta** (isolamento por `profile.id`); nunca é compartilhada nem visível a outra conta.
- [ ] **Nome único por conta** entre as categorias não arquivadas (comparação sem diferenciar maiúsculas/minúsculas): criar duas "Natura" recusa com erro claro do envelope `{ error: { code, message } }`.
- [ ] A criação é livre (não consome crédito): categoria é organização, não envio.

---

### H16.2: Listar, editar e arquivar categorias 🟢 `[+]`
Como **usuário com conta**, quero ver, renomear e arquivar minhas categorias, para manter a organização em dia.
*Critérios de aceite:*
- [ ] Vejo minhas categorias **não arquivadas** (nome + cor), ordenadas por nome.
- [ ] Posso **renomear** ou trocar a **cor** de uma categoria; a mudança se reflete em todos os combinados que a usam (o combinado referencia a categoria, não copia o nome).
- [ ] Posso **arquivar** uma categoria (soft-delete): ela sai da lista de escolha e dos filtros, mas os combinados que já a usavam **não somem nem perdem o histórico** (regra de não-DELETE de negócio). Arquivar não apaga do banco.
- [ ] Renomear para um nome que já existe (ativo) recusa, como em H16.1.

---

### H16.3: Marcar as categorias de um combinado (multi-seleção) 🟢 `[+]`
Como **criador (cobrador ou devedor)**, quero escolher **uma ou mais** categorias ao criar ou editar um combinado, para agrupá-lo com os da mesma marca/linha (ex.: um pedido misto de "Natura" e "Presentes").
*Critérios de aceite:*
- [ ] Ao **criar** um combinado (Épicos 2/3), posso escolher **nenhuma, uma ou várias** categorias minhas (opcional; combinado sem categoria é válido).
- [ ] Ao **editar** um combinado, posso adicionar, remover ou limpar as categorias. A edição das categorias é **livre** (não dispara reaprovação do devedor, diferente de valor/data): categoria é dado interno, não muda o acordo com a outra ponta.
- [ ] Cada categoria escolhida precisa ser **minha** e **não arquivada**; caso contrário a api recusa (defesa no servidor, não só na UI).
- [ ] As categorias **não entram** em nenhuma mensagem ao devedor (nem no combinado enviado, nem nos lembretes).
- [ ] O vínculo é uma **junção** (um combinado tem N categorias; uma categoria marca N combinados); trocar/limpar as categorias de um combinado nunca apaga a categoria do catálogo.

---

### H16.4: Filtrar o painel por categoria 🟢 `[+]`
Como **usuário com conta**, quero filtrar meus combinados por categoria, para ver de cada marca separadamente.
*Critérios de aceite:*
- [ ] No painel (Épico 9), posso **filtrar a lista por categoria** (uma por vez), combinável com os filtros que já existem (papel, situação, período, busca).
- [ ] Com multi-categoria (H16.3), o filtro tem semântica **"contém"**: um combinado aparece quando **uma das suas** categorias é a escolhida (não precisa ser a única).
- [ ] O filtro roda no **servidor** (H9.8); o front só solicita e exibe.
- [ ] Combinados **sem categoria** aparecem normalmente quando nenhum filtro de categoria está ativo, e podem ser isolados por um filtro "Sem categoria".
- [ ] O filtro por categoria é coerente com o filtro por período (Épico 9 H9.6): ao desmembrar o recorrente por ocorrência, cada linha mantém as categorias do combinado.

---

### Decisões tomadas
- **Categoria = rótulo livre do usuário**, isolado por conta, com nome (1 a 40) e cor opcional (`#RRGGBB`). Sem catálogo fixo imposto pelo produto.
- **Múltiplas categorias por combinado** (atualizado 2026-07-16): a relação virou uma **junção** `aviso_categorias` (antes era a coluna única `avisos.categoria_id`). Motivo: a prática de venda direta faz pedidos mistos (mais de uma marca no mesmo combinado). O filtro do painel passa a ter semântica "contém".
- **Métrica por categoria com atribuição integral** (Épico 18 H18.3): com multi, cada combinado soma o valor cheio em cada categoria a que pertence; os buckets podem se sobrepor e não somam ao total geral (que é lido sem join, então não infla).
- **Arquivar, nunca apagar** (soft-delete `arquivada`), coerente com a regra de não-DELETE e com `chaves_pix`.
- **Editar categorias de um combinado é livre** (não abre reaprovação): é dado interno do dono, não altera o acordo com o devedor.
- **Nunca vaza para o devedor:** categoria é só organização/relatório do dono da conta.

### Fora de escopo deste épico
- ❌ Métricas por categoria (lucro/ticket por categoria): vivem no épico de Gestão (Épico 18, Fase A do estudo), que consome este eixo.
- ❌ Categorias compartilhadas entre contas ou sugeridas pelo produto.
- ❌ Categoria por **produto** (Épico 17): categoria é do combinado, não do item do catálogo.
