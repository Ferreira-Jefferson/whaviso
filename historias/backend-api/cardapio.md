# API-cardapio cardapio

- **ID:** API-cardapio  ·  **Área:** API  ·  **Onda:** 1
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Grupos de opções, categorias, itens e a herança com exceção entre eles. É o nó de normalização do
produto: o dono monta o cardápio **uma vez** (grupos reutilizáveis como "Tamanho", "Adicionais", "Ponto
da carne"), liga os grupos às categorias, e os itens herdam; só a exceção é registrada por item.
"Pronto" observável: o dono cria grupos/opções, categorias, itens e vínculos; `GET /cardapio` devolve a
árvore **resolvida** (cada item com seus grupos efetivos já aplicados herança + exceção, opções com
disponibilidade calculada pelo servidor); ligar/desligar item ou opção e marcar "esgotado hoje" funciona
e volta sozinho. O mesmo resolvedor é reusado por `pedidos` (validação de preço) e pelo atendente.

## Dependências

- `F4` api-core: registry, erros, config, `shared/db`. Transitivas: `F0` (tabelas do cardápio),
  `F1` (contratos), `F3` (escopo de loja).
- Dependentes: `API-pedidos` (valida item/opções contra o cardápio), `AT-motor-min`, `API-cardapio-imp`.

## Contratos e tabelas que toca

**Dono de escrita (única fonte de escrita de todas):** `grupos_opcoes`, `opcoes`, `categorias`,
`categoria_grupos`, `itens`, `item_grupos`. `whaviso_api` tem select/insert/update; **sem DELETE**
(remoção lógica por `ativo = false`; vínculos usam `ordem`/`incluir`). `whaviso_atendente` só lê.

**Modelo (do baseline 0004, vale para todo o plano):**
- `grupos_opcoes`: `tipo` tamanho/adicional/customizado, `obrigatorio`, `min_escolhas`, `max_escolhas`
  (NULL = sem limite), `aplica_a_opcao_id` (add-on que só vale para uma opção de tamanho), `ativo`, `ordem`.
  Checks no banco: `obrigatorio` implica `min >= 1`; `max >= max(min,1)`.
- `opcoes`: `grupo_id`, `preco_centavos >= 0`, `padrao`, `ativo`, `esgotado_ate`, `ordem`.
- `categorias`: `programacao` jsonb (dias/horários; NULL = sempre), `ativo`, `ordem`.
- `categoria_grupos` (M:N, PK `categoria_id, grupo_id`): grupos herdados por **todos** os itens da categoria.
- `itens`: `categoria_id`, `preco_centavos` base, `sugerivel`, `ativo`, `esgotado_ate`, `imagem_url`.
- `item_grupos` (PK `item_id, grupo_id`): exceção por item. `incluir = true` **acrescenta** um grupo que a
  categoria não tem; `incluir = false` **remove** um grupo herdado.

**Regra de resolução (contrato do módulo, fonte única):** os grupos efetivos de um item =
(grupos de `categoria_grupos` da categoria do item) menos (`item_grupos` com `incluir = false`) mais
(`item_grupos` com `incluir = true`). Ordem: `item_grupos.ordem` quando o vínculo existe, senão
`categoria_grupos.ordem`, depois `grupos_opcoes.ordem`. Grupos com `ativo = false` somem. Opção
indisponível = `ativo = false` **ou** `esgotado_ate > now()`; item indisponível idem, e item/ categoria
inativa ou fora da `programacao` (America/Sao_Paulo) não aparece como pedível.

**Preço:** preço final do item = `itens.preco_centavos` + soma dos `preco_centavos` das opções escolhidas
(sempre centavos inteiros). Grupo de tamanho define a variação sobre o preço base.

**Contratos Zod (F1):** `GrupoOpcoes*`, `Opcao*`, `Categoria*`, `CategoriaGrupoVinculo`, `Item*`,
`ItemGrupoExcecao`, `Programacao`, `CardapioResolvidoSaida` (árvore: categorias -> itens -> grupos
efetivos -> opções com `disponivel`), `DisponibilidadeEntrada` (ativo / `esgotado_ate`).

**Lê por read-model:** `lojas` (existência/escopo; leitura via `shared/db`).

Evento de auditoria (sem PII): `cardapio.grupo_alterado`, `cardapio.item_alterado`,
`cardapio.disponibilidade_alterada`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/cardapio/**`
- `backend/apps/api/src/routes.ts` (1 linha, combinado)
- `backend/packages/shared/src/contracts/cardapio*.ts`
- `backend/packages/shared/src/cardapio_resolvedor/**` (função pura de resolução, sem I/O, kernel
  reusável por api e atendente; **não** tem regra de escrita)

## Etapas

- [ ] 1. Scaffold `cardapio` + MODULE.md (dono das 6 tabelas; expõe o resolvedor puro no kernel)
  (commit: `chore(api-cardapio): scaffold do modulo cardapio`)
- [ ] 2. Contratos Zod de grupo, opção, categoria, item, vínculos, programação e árvore resolvida;
  regenerar `_generated`  (commit: `feat(contracts): contratos do cardapio`)
- [ ] 3. Resolvedor puro no kernel: `resolverGruposDoItem`, `calcularPrecoItem`, `estaDisponivel(ent,
  agora)`, `dentroDaProgramacao(prog, agora)` com fuso America/Sao_Paulo. Testes tabulares extensos
  (herança, exceção remove, exceção acrescenta, grupo inativo, ordem, esgotado_ate no passado/futuro,
  programação cruzando meia-noite, add-on com `aplica_a_opcao_id`)
  (commit: `feat(shared): resolvedor puro de heranca e excecao do cardapio`)
- [ ] 4. Repo de **grupos e opções**: CRUD com validação (limites min/max coerentes com número de opções
  ativas; `padrao` respeita `max_escolhas`; `aplica_a_opcao_id` deve ser opção de **tipo tamanho** da
  mesma loja)  (commit: `feat(api-cardapio): grupos de opcoes e opcoes`)
- [ ] 5. Rotas `grupos`: `GET/POST /cardapio/grupos`, `PATCH /cardapio/grupos/:id`, `POST
  /cardapio/grupos/:id/opcoes`, `PATCH /cardapio/opcoes/:id`, reordenar
  (commit: `feat(api-cardapio): rotas de grupos e opcoes`)
- [ ] 6. Repo e rotas de **categorias**: CRUD, `programacao`, reordenar, ativar/desativar; vínculo
  `PUT /cardapio/categorias/:id/grupos` (substitui a lista de `categoria_grupos` de forma idempotente,
  ordem inclusa)  (commit: `feat(api-cardapio): categorias e vinculo de grupos`)
- [ ] 7. Repo e rotas de **itens**: CRUD, mover de categoria, `sugerivel`, `imagem_url` por allowlist;
  `PUT /cardapio/itens/:id/grupos` registra **apenas exceções** (acrescentar/remover) e rejeita
  exceção redundante (acrescentar grupo já herdado, remover grupo não herdado)
  (commit: `feat(api-cardapio): itens e excecoes por item`)
- [ ] 8. Disponibilidade: `POST /cardapio/itens/:id/disponibilidade` e `/opcoes/:id/disponibilidade`
  com `ativo` e `esgotado_ate` (atalho "esgotado hoje" = fim do dia em America/Sao_Paulo; "indisponível
  até" = instante informado, no futuro)  (commit: `feat(api-cardapio): ligar, desligar e esgotado ate`)
- [ ] 9. `GET /cardapio` (árvore resolvida para o painel, inclui itens inativos com flag) e
  `GET /cardapio/publico-resolvido` interno para uso de `pedidos` (só pedíveis agora). Ambos usam o
  resolvedor do kernel  (commit: `feat(api-cardapio): arvore resolvida do cardapio`)
- [ ] 10. Evitar deixar o cardápio inconsistente: não desativar grupo/opção referenciado como
  `aplica_a_opcao_id` sem avisar (resposta traz `impactos`); não permitir que um item fique sem categoria
  ativa  (commit: `feat(api-cardapio): guardas de consistencia do cardapio`)
- [ ] 11. Auditoria sem PII nas mutações  (commit: `feat(api-cardapio): auditoria de mutacoes do cardapio`)
- [ ] 12. Testes de unidade e integração do módulo  (commit: `test(api-cardapio): suite do cardapio`)
- [ ] 13. Testes de segurança (SEC-001/002/081)  (commit: `test(api-cardapio): sec de isolamento do cardapio`)

## Testes e segurança exigidos

**Unidade/integração (banco `whaviso_dev`):**
- Resolvedor: todos os casos tabulares da etapa 3; propriedade: resultado independe da ordem de inserção
  dos vínculos.
- Integridade cruzada de loja: grupo da loja A **não** pode ser vinculado a categoria/item da loja B
  (o banco só tem FK simples, então a **api valida `loja_id` de ambos os lados** em todo vínculo;
  teste tenta cruzar e espera 404/422).
- Checks do banco refletidos em erro amigável (`obrigatorio` sem `min`, `max < min`, preço negativo).
- `aplica_a_opcao_id` só aceita opção de grupo tamanho da mesma loja.
- Matriz de papéis: atendente lê (e liga/desliga disponibilidade, ver Notas), gerente e dono editam.
- `esgotado_ate` no passado = disponível; no futuro = indisponível; volta sozinho sem job.
- Atendente (`SET ROLE whaviso_atendente`) lê tudo do cardápio e não escreve nada.

**SEC aplicáveis:**
- `SEC-001`: loja A não lê/edita cardápio da loja B (todas as rotas).
- `SEC-002`: `loja_id` do corpo ignorado; todo vínculo valida pertencimento à loja do escopo.
- `SEC-081`: Zod rejeita tipos, tamanhos de nome/descrição e enums inválidos; `programacao` validada.
- `SEC-030`: nenhum DELETE em tabela do cardápio (grant inexistente, confirmado por `SET ROLE`).
- `SEC-080`: toda query parametrizada.

## Notas e decisões

- **Vínculos sem UPDATE de negócio:** `categoria_grupos`/`item_grupos` são substituídos por reconciliação
  (insert/update de `ordem`/`incluir`); como não há DELETE, **remover** um vínculo de `categoria_grupos`
  não é possível pelo grant. Decisão: ligar/desligar grupo da categoria sem DELETE exige um sinal. Como a
  tabela não tem coluna `ativo`, a etapa 6 **precisa** de uma das saídas, a decidir com o dono antes de
  implementar: (a) migration que acrescenta `ativo boolean` em `categoria_grupos` e `item_grupos`, ou
  (b) conceder DELETE a `whaviso_api` somente nessas duas tabelas de ligação (configuração, não
  negócio; análogo à exceção de `templates`, exigiria ajuste de SEC-030). Recomendação: (a), por manter a
  regra "nada some". Esta decisão bloqueia as etapas 6 e 7; registrar a escolha aqui antes de seguir.
- **Quem liga/desliga disponibilidade:** `atendente` (papel de loja) pode marcar "esgotado hoje" porque é
  rotina de salão; criar/editar estrutura do cardápio é de gerente e dono.
- **Snapshot é do pedido:** este módulo nunca reescreve pedido. Mudar preço aqui não altera
  `itens_pedido` (snapshot, ver `API-pedidos`).
- **Resolvedor no kernel:** a mesma função pura serve a api e ao atendente, evitando duas
  implementações divergentes de herança. É código sem I/O e sem regra de escrita (kernel enxuto).
- **Importação por foto/PDF** é outro módulo (`API-cardapio-imp`, Onda 2), que escreve via os serviços
  deste módulo, não direto nas tabelas.
