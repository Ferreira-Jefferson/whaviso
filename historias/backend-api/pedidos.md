# API-pedidos pedidos

- **ID:** API-pedidos  ·  **Área:** API  ·  **Onda:** 1
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Pedidos no formato kanban (`novo` -> `em_preparo` -> `saiu_entrega` -> `entregue`, com `problema`), itens
com **snapshot** de nome e preço, modificadores (opções) também em snapshot, criação manual pelo painel e
impressão do pedido. "Pronto" observável: o painel mostra o kanban ao vivo por loja; o operador cria
um pedido manual, move o pedido de coluna respeitando as transições, marca problema com motivo, e imprime
a comanda; mudar preço ou nome no cardápio depois **não** altera nenhum pedido já criado; os totais
conferem em centavos (`total = subtotal + taxa`).

## Dependências

- `F4` api-core: registry, erros, config, `shared/db`. Transitivas: `F0` (tabelas e checks), `F1`
  (contratos), `F3` (escopo). Tempo real: `F5`, via NOTIFY (ver Notas).
- `API-cardapio`: o pedido manual valida item/opções e calcula preço pelo **resolvedor do kernel** e pela
  mesma regra de disponibilidade; sem o cardápio não há o que snapshotar.
- `API-clientes`: cliente e endereço do pedido (e o carimbo `ultimo_uso_em`).
- Dependentes: `AT-motor-min` (cria rascunho e confirma), `API-pagamentos`, `API-despacho`,
  `API-dashboard`.

## Contratos e tabelas que toca

- **Dono de escrita:** `pedidos`, `itens_pedido`, `itens_pedido_opcoes` (`whaviso_api`: select/insert/update,
  sem DELETE; linha removida = `itens_pedido.cancelado = true`). O `atendente` também escreve: cria e
  ajusta **rascunho** e só pode confirmar `rascunho -> novo` (policy da 0005); depois disso o kanban é da
  api. Este módulo é o dono do **kanban** (mudança de status pós-`novo`).
- **Lê por read-model (via `shared/db`, documentado no MODULE.md, sem import de módulo):** `itens`,
  `opcoes`, `grupos_opcoes`, `categorias`, `categoria_grupos`, `item_grupos` (cardápio, para validar e
  snapshotar; usa o resolvedor puro do kernel); `clientes`/`enderecos` (nome, endereço, e atualiza só
  `enderecos.ultimo_uso_em`); `lojas` (existência e horário); `conversas` (id/status, só leitura).
- **Colunas que outros módulos preenchem depois:** `zona_id`, `corrida_id`, `ordem_parada`, `motoboy_id`,
  `motoboy_nome` (Onda 3/5). Este módulo **não** as escreve, mas as devolve nulas/preenchidas no DTO.
- **Máquina de estados (contrato do módulo):**
  - `rascunho` -> `novo` (confirmação; atendente ou painel).
  - `novo` -> `em_preparo` -> `saiu_entrega` -> `entregue`.
  - `novo`, `em_preparo`, `saiu_entrega` -> `problema` (exige `problema_motivo`; o check do banco o
    obriga).
  - `problema` -> `em_preparo` ou `saiu_entrega` (retomada) ou `entregue`.
  - `retirada`: `em_preparo` -> `entregue` direto (pula `saiu_entrega`).
  - Retrocesso (ex.: `em_preparo` -> `novo`) negado, exceto via `problema`. `entregue_em` é gravado ao
    chegar em `entregue`.
- **Código curto:** `pedidos.codigo`, único por loja; gerado no servidor, legível (ex.: sequência diária
  com prefixo, decisão em Notas).
- **Contratos Zod (F1):** `PedidoCriarManualEntrada` (cliente, endereço ou retirada, itens com `item_id`,
  `quantidade`, `opcoes_ids`, `observacao`), `PedidoKanbanSaida` (cards), `PedidoDetalheSaida` (itens e
  opções em snapshot, totais, cliente com telefone **mascarado**, endereço), `PedidoStatusEntrada`
  (`para`, `motivo?`), `PedidoImpressaoSaida`.
- Evento SSE: `pedido.criado`, `pedido.status_alterado` (payload só `{loja_id, pedido_id, status}`).
- Evento de auditoria (sem PII): `pedido.criado`, `pedido.status_alterado` (de, para, quem),
  `pedido.item_cancelado`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/pedidos/**`
- `backend/apps/api/src/routes.ts` (1 linha, combinado)
- `backend/packages/shared/src/contracts/pedidos*.ts`
- `backend/packages/shared/src/pedido_estados/**` (tabela de transições, função pura, reusável pelo
  atendente)
- `backend/supabase/migrations/<proxima>_notify_pedidos.sql` (trigger `NOTIFY`; só se F5 não entregar a
  função genérica)

## Etapas

- [ ] 1. Scaffold `pedidos` + MODULE.md (dono do kanban e itens; leituras cruzadas declaradas por tabela)
  (commit: `chore(api-pedidos): scaffold do modulo pedidos`)
- [ ] 2. Função pura de transição `podeTransicionar(de, para, modalidade)` e `motivoObrigatorio(para)`
  no kernel, com teste tabular da matriz completa  (commit: `feat(shared): maquina de estados do pedido`)
- [ ] 3. Contratos Zod do módulo + regenerar `_generated`  (commit: `feat(contracts): contratos de pedidos`)
- [ ] 4. Montador de pedido (serviço puro + leitura do cardápio): dado `item_id`, `opcoes_ids`,
  `quantidade`, valida que o item está pedível agora, que as opções pertencem aos grupos efetivos do
  item, respeita `obrigatorio`/`min`/`max`, `aplica_a_opcao_id` e disponibilidade, e devolve as linhas já
  com **snapshots** (`nome_snapshot`, `grupo_nome_snapshot`, `preco_unitario_centavos`, preço por opção) e
  `total_centavos` da linha = (preço unitário + soma das opções) x quantidade. Todo cálculo em centavos
  inteiros  (commit: `feat(api-pedidos): montador com snapshot e validacao contra o cardapio`)
- [ ] 5. Geração do `codigo` por loja (função de repositório com retry em conflito no índice único
  `(loja_id, codigo)`)  (commit: `feat(api-pedidos): codigo curto unico por loja`)
- [ ] 6. Repo SQL parametrizado: inserir pedido + itens + opções **em uma transação**, buscar kanban
  por `loja_id` e status, detalhe, atualizar status, cancelar linha  (commit: `feat(api-pedidos): repositorio de pedidos`)
- [ ] 7. `POST /pedidos` (criação manual, origem `manual`; status inicial `novo`): valida cliente e
  endereço no escopo (leitura cruzada), `taxa_entrega_centavos` informada pelo operador (precificação por
  zona é Onda 3), `total = subtotal + taxa`; marca `enderecos.ultimo_uso_em` por SQL próprio
  (commit: `feat(api-pedidos): criar pedido manual com snapshot`)
- [ ] 8. `GET /pedidos` (kanban: colunas, filtros por data/modalidade/origem, paginação por coluna) e
  `GET /pedidos/:id` (detalhe)  (commit: `feat(api-pedidos): kanban e detalhe do pedido`)
- [ ] 9. `POST /pedidos/:id/status` (transição validada pela etapa 2; `problema` exige motivo; carimba
  `entregue_em`; `UPDATE ... WHERE status = :de` para otimismo contra corrida, 409 se mudou)
  (commit: `feat(api-pedidos): mover pedido no kanban com transicoes validas`)
- [ ] 10. `POST /pedidos/:id/itens/:itemId/cancelar` (`cancelado = true`, recalcula subtotal e total
  na mesma transação; só enquanto `novo`/`em_preparo`; ao menos uma linha ativa; senão exige cancelar o
  pedido via `problema`)  (commit: `feat(api-pedidos): cancelar linha de item com recalculo`)
- [ ] 11. Impressão: `GET /pedidos/:id/impressao?formato=html|texto` devolve comanda a partir **só do
  snapshot** (código, hora em America/Sao_Paulo, cliente com nome, endereço, itens, opções, observações,
  totais), formatada para térmica de 58/80 mm (texto colunado) e HTML com CSS de impressão; `Cache-Control:
  no-store`; auditoria `pedido.impresso`  (commit: `feat(api-pedidos): impressao da comanda a partir do snapshot`)
- [ ] 12. NOTIFY/SSE: usar a função genérica de F5 ou migration própria com trigger em `pedidos`
  (insert e update de `status`), payload sem PII; registrar canal `pedidos` autorizado por escopo
  (commit: `feat(api-pedidos): eventos ao vivo do kanban`)
- [ ] 13. Auditoria sem PII  (commit: `feat(api-pedidos): auditoria de pedidos`)
- [ ] 14. Testes de unidade e integração do módulo  (commit: `test(api-pedidos): suite de pedidos`)
- [ ] 15. Testes de segurança (SEC-001/002/003/030)  (commit: `test(api-pedidos): sec de isolamento e integridade`)

## Testes e segurança exigidos

**Unidade/integração:**
- Máquina de estados: toda combinação (válida passa, inválida 409/422), retirada pula entrega, `problema`
  sem motivo rejeitado (api e check do banco).
- Montador: obrigatório sem escolha, acima do `max`, opção de grupo que o item não tem, opção esgotada,
  item fora da programação, add-on cujo `aplica_a_opcao_id` não foi escolhido; preço correto com
  tamanho + adicionais + quantidade; `total = subtotal + taxa` sempre.
- **Snapshot:** criar pedido, alterar nome/preço do item e da opção no cardápio, ler o pedido: valores
  originais preservados; imprimir depois da mudança: comanda original.
- Corrida: duas mudanças de status simultâneas, só uma vence.
- Rascunho do atendente não aparece no kanban; confirmar (`rascunho -> novo`) faz aparecer; atendente
  (`SET ROLE whaviso_atendente`) não consegue mover `novo -> em_preparo` (policy).
- Cliente/endereço de outra loja devolve 404; cancelamento de linha recalcula totais.
- Impressão: conteúdo só do snapshot, sem telefone completo.

**SEC aplicáveis:**
- `SEC-001`: loja A não lê, move nem imprime pedido da loja B.
- `SEC-002`: `loja_id` do corpo ignorado; `item_id`/`opcoes_ids`/`cliente_id` validados contra a loja do
  escopo (impede montar pedido com item de outra loja).
- `SEC-003`: operador da plataforma é negado em todos os endpoints (conteúdo de cliente).
- `SEC-030`: nenhum DELETE em `pedidos`/`itens_pedido`/`itens_pedido_opcoes` (grant inexistente).
- `SEC-024`: endereço, nome e telefone do cliente não entram em log; redaction cobre.
- `SEC-081`: Zod rejeita quantidade <= 0, preço vindo do cliente (o preço **nunca** é aceito do corpo,
  sempre calculado no servidor), enums inválidos. `SEC-080`: queries parametrizadas.

## Notas e decisões

- **Preço sempre do servidor:** o payload de criação não aceita preço; a fonte é o cardápio resolvido no
  momento. Isto fecha a manipulação de total pelo cliente da api.
- **Taxa de entrega:** nesta onda é digitada pelo operador (ou 0). O cálculo por zona entra com
  `API-zonas`; o campo e o check de total já suportam.
- **Código do pedido:** decisão: `AAMMDD-NNN` (sequência diária por loja, em America/Sao_Paulo), curto e
  legível para o salão; unicidade garantida pelo índice `(loja_id, codigo)` com retry.
- **Transição `problema -> ...`:** permitida para retomar, para não prender o operador após um erro.
- **Cardápio sem import:** `pedidos` não importa o módulo `cardapio`. Usa o **resolvedor puro do
  kernel** e SQL de leitura próprio, documentados no MODULE.md (leitura cruzada read-only, permitida pela
  arquitetura). Se o resolvedor ainda não existir no kernel (entrega do `API-cardapio` etapa 3), esta
  etapa 4 fica bloqueada até lá.
- **Cancelar o pedido inteiro:** não há status `cancelado`; cancelamento operacional é `problema` com
  motivo. Se o produto exigir status próprio, é migration de enum e revisão da máquina de estados.
- **Impressão:** só geração do documento (HTML/texto). Envio direto a impressora térmica (ESC/POS,
  agente local) é melhoria posterior, não bloqueia o "pronto".
- **Pagamento:** estado de pagamento fica em `API-pagamentos` (Onda 3); o kanban não depende dele.
