# pedidos

## Proposito
Kanban de pedidos da loja: criacao manual pelo painel com snapshot de nome/preco (item e opcoes),
maquina de estados validada no servidor, cancelamento de linha com recalculo, comanda para impressao e
evento ao vivo. Fonte: `historias/backend-api/pedidos.md`.

## Entry points
- `index.ts`: `pedidosRoutes` (registry) e `criarPedidosRoutes(cifra?)` (cifra injetavel em teste).
- Rotas finais (`/v1/pedidos`, todas `conteudo_de_loja` + permissao `pedidos:gerir`):
  `GET /` (kanban; `coluna`, `cursor`, `limite`, `modalidade`, `origem`, `data`),
  `POST /` (criacao manual, status inicial `novo`, origem `manual`; aceita `forma_pagamento` e
  `troco_para_centavos` opcionais), `GET /:id`,
  `POST /:id/status` (`{ para, motivo? }`), `POST /:id/itens/:itemId/cancelar`,
  `GET /:id/impressao?formato=html|texto&largura=32|48`.

## Especialistas consumidos
- `@whaviso/shared/db` (sql, comTransacao, `notificar`), `@whaviso/shared/contracts`, `@whaviso/shared/datas`,
  `@whaviso/shared/cifra` (so para mascarar telefone), `shared/http_errors`, `shared/tenant` (`escopoLoja`).

## Tabelas
- dono de escrita: `pedidos`, `itens_pedido`, `itens_pedido_opcoes` (sem DELETE; linha removida = `cancelado = true`).
- escreve ainda: `eventos` (`pedido.criado`, `pedido.status_alterado`, `pedido.item_cancelado`, `pedido.impresso`;
  `detalhes` sem PII: user_id, de/para, formato) e `enderecos.ultimo_uso_em` (contrato do modulo clientes).
- NAO escreve `zona_id`, `corrida_id`, `ordem_parada`, `motoboy_id`, `motoboy_nome` (Ondas 3/5); so os devolve.

## Leituras cruzadas (read-model via `shared/db`, sem importar modulo)
- Cardapio (`repo.lerCardapio`): `itens`, `categorias`, `categoria_grupos`, `item_grupos`, `grupos_opcoes`, `opcoes`,
  sempre com `loja_id`. As regras PURAS do resolvedor (heranca categoria -> item, disponibilidade
  `ativo`/`esgotado_ate`, programacao em America/Sao_Paulo) estao replicadas em `cardapio_leitura.ts` porque o
  resolvedor ainda vive no modulo cardapio e nao subiu ao kernel. Quando subir, trocar a copia pelo kernel.
- Clientes: `clientes` (existencia por loja, nome, `telefone_cifrado` so para MASCARAR) e `enderecos` (ativo e do cliente).

## Regras
- **Preco do servidor:** o corpo nao aceita preco; o montador (`montador.ts`, puro) valida item pedivel agora,
  opcoes dos grupos efetivos, `obrigatorio`/`min`/`max`, add-on com `aplica_a_opcao_id` e disponibilidade, e
  calcula `(base + opcoes) x quantidade`. `total = subtotal + taxa` (taxa digitada pelo operador; retirada exige 0).
- **Snapshot:** nome do item, nome do grupo, nome e preco das opcoes gravados no pedido; mudar o cardapio depois
  nao altera pedido nem comanda.
- **Estados** (`estados.ts`, puro): `rascunho -> novo -> em_preparo -> saiu_entrega -> entregue`; `problema` a partir de
  novo/em_preparo/saiu_entrega (exige motivo) e retomada para em_preparo/saiu_entrega/entregue; retirada pula
  `saiu_entrega`; entrega nao pula; sem retrocesso. Transicao invalida = 409 `transicao_invalida`; corrida = 409
  `status_alterado` (`UPDATE ... WHERE status = :de`). Falta de motivo = 422 `motivo_obrigatorio`.
- **Codigo:** `AAMMDD-NNN` (dia de Sao Paulo, sequencia por loja), unicidade pelo indice `(loja_id, codigo)` com retry.
- **Cancelar linha:** so em novo/em_preparo, trava o pedido (`FOR UPDATE`), nao deixa zerar as linhas (422
  `ultima_linha`; cancelar o pedido inteiro = `problema`), recalcula totais na mesma transacao.
- **Impressao:** so do snapshot, sem telefone, `Cache-Control: no-store`, auditoria `pedido.impresso`. Resposta JSON
  `{ formato, conteudo }`. Carimba o pagamento (G9): `Pagamento: <forma>` e, no dinheiro, `Troco para` e o troco a
  devolver (`troco_para - total`, "sem troco" se nao sobra).
- **Pagamento (G9):** `forma_pagamento` (dinheiro/credito/debito/pix/outro) e `troco_para_centavos` (so com dinheiro;
  o servidor recusa `troco_so_dinheiro` 422, o banco tem o mesmo check) carimbados no pedido (migration 0056).
- **Guarda de aceite (G7):** criar pedido novo e recusado com a loja pausada agora (409 `loja_pausada`) ou com a
  janela de capacidade cheia (409 `capacidade_excedida`). Le `lojas` (pausa/capacidade) e conta os pedidos nao-rascunho
  da janela movel por read-model (`repo.estadoAceiteLoja`), sem importar o modulo lojas.
- **Baixa de estoque na efetivacao (G2):** disparada por TRIGGER no banco (migration 0055), nao pelo modulo. Ao entrar
  em `novo` (criacao manual OU confirmacao `rascunho -> novo` do atendente), decrementa na mesma transacao a contagem
  por item (`itens.quantidade_disponivel`) e os insumos da ficha tecnica, nunca negativo, idempotente por pedido.
  Por isso nao ha chamada TS do modulo pedidos aos modulos `estoque_*` (fronteira preservada; o trigger serve os dois
  caminhos de efetivacao).
- **Rascunho:** nao aparece no kanban; `GET /:id` o devolve; `rascunho -> novo` pode ser feito por `POST /:id/status`.

## Realtime
`notificar(tx, { tipo: 'pedido.atualizado', loja_id, payload: { pedido_id, loja_id, status } })` dentro da transacao
(criacao, mudanca de status, cancelamento de linha). Contrato `EventoPedidoAtualizado` (strict, sem PII).

## Contratos (espelhar no front)
`schemas.ts`: `PedidoCriarManualEntrada`, `PedidoStatusEntrada`, `KanbanQuery`, `PedidoKanbanSaida` (colunas com
`itens: PedidoCard[]` e `proximoCursor`), `PedidoDetalheSaida` (itens/opcoes em snapshot, cliente com telefone mascarado,
endereco, `destinos`), `PedidoImpressaoSaida`.

## Fora de escopo
Despacho, precificacao por zona, envio a impressora (ESC/POS), conciliacao automatica de Pix (PSP/webhook).
