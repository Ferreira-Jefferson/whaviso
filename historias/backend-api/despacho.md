# API-despacho despacho (básico)

- **ID:** API-despacho  ·  **Área:** API  ·  **Onda:** 3
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Despacho **manual**: atribuir um motoboy a um pedido e montar uma **corrida** (lote de despacho: 1
motoboy, N pedidos, ordem de parada definida à mão). O nome do motoboy fica registrado no pedido para
responsabilização. A roteirização automática (agrupar por preparo e proximidade, `ClienteMapas`) é da
onda 5, módulo `API-roteiriza`, e **não** é feita aqui.

"Pronto" observável: `POST /pedidos/:id/motoboy` atribui/troca o motoboy; `POST /corridas` cria uma
corrida em `montando`, adiciona e reordena pedidos, atribui motoboy e a despacha; concluir a corrida
libera o lote; uma corrida nunca mistura lojas nem pedidos fora de estado despachável.

## Dependências

- `API-pedidos`: pedidos e seu estado (kanban); este módulo lê por read-model e escreve só as colunas de
  despacho (ver Contratos).
- `API-motoboys`: cadastro de motoboys ativos para atribuir (lido por read-model, nunca importado).
- `API-zonas`: zona/valor da entrega no pedido (read-model), para exibir o valor do motoboy por parada.

## Contratos e tabelas que toca

- **`corridas`**: dono de escrita (0007: `whaviso_api` select/insert/update). Campos: `motoboy_id`,
  `status` (`montando | despachada | concluida`), `sugerida` (sempre `false` aqui; `true` é da
  roteirização), `despachada_em`, `concluida_em`.
- **`pedidos`**: o dono de escrita é `API-pedidos`. Este módulo escreve **somente** as quatro colunas de
  despacho: `motoboy_id`, `motoboy_nome`, `corrida_id`, `ordem_parada`. Atualização sempre por
  `UPDATE` de colunas explícitas, com `WHERE loja_id = $1 AND id = $2`. O `status` do pedido **não** é
  alterado aqui (ver Notas).
- **Lê (read-model):** `pedidos` (status, código, total, zona, endereço), `enderecos` (rua, bairro,
  `lat/lng` se existirem), `motoboys` (id, nome, ativo), `zonas_entrega` (valor do motoboy).
- Contratos Zod: `AtribuirMotoboyEntrada`, `CorridaEntrada`, `CorridaSaida` (com paradas ordenadas),
  `ReordenarParadasEntrada`, `DespacharEntrada`.
- Eventos de realtime (SSE via `F5`): `corrida.atualizada`, `pedido.motoboy_atribuido`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/despacho/**`
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/packages/shared/src/contracts/despacho/**`
- `backend/apps/api/test/**/despacho*`

## Etapas

- [ ] 1. Scaffold do módulo e registro em `routes.ts`  (commit: `feat(despacho): scaffold do módulo`)
- [ ] 2. Contratos Zod e `gen_contracts`  (commit: `feat(contratos): despacho e corridas`)
- [ ] 3. Atribuir motoboy ao pedido: `POST /pedidos/:id/motoboy` valida pedido da loja, modalidade
  `entrega`, estado despachável, motoboy ativo da mesma loja; grava `motoboy_id` e `motoboy_nome`
  (snapshot do nome) numa transação; remoção = `motoboy_id = null` por
  `POST .../motoboy/remover`  (commit: `feat(despacho): atribuir motoboy ao pedido`)
- [ ] 4. Trocar motoboy: permitido antes de `entregue`, com registro de evento em `eventos` (de/para, sem
  PII) para responsabilização; troca depois de `entregue` é 409 (ajuste vai por lançamento em
  `API-motoboys`)  (commit: `feat(despacho): trocar motoboy com auditoria`)
- [ ] 5. Criar corrida: `POST /lojas/:lojaId/corridas` cria em `montando` (opcionalmente já com motoboy e
  lista de pedidos)  (commit: `feat(despacho): criar corrida`)
- [ ] 6. Compor corrida: `POST /corridas/:id/pedidos` e `.../pedidos/:pedidoId/remover`; só pedidos da
  mesma loja, de entrega, sem outra corrida ativa; `ordem_parada` sequencial contínua; corridas fora de
  `montando` são imutáveis nesta operação  (commit: `feat(despacho): adicionar e remover pedidos da corrida`)
- [ ] 7. Reordenar paradas: `PUT /corridas/:id/ordem` recebe a lista completa de ids e regrava
  `ordem_parada` numa transação; rejeita ids que não pertencem à corrida  (commit: `feat(despacho): reordenar paradas`)
- [ ] 8. Atribuir motoboy à corrida: propaga `motoboy_id`/`motoboy_nome` a todos os pedidos da corrida de
  forma atômica e consistente (uma corrida, um motoboy)  (commit: `feat(despacho): motoboy da corrida`)
- [ ] 9. Despachar: `POST /corridas/:id/despachar` exige motoboy e >= 1 pedido, muda `status` para
  `despachada`, grava `despachada_em`, trava edição de composição; idempotente  (commit: `feat(despacho): despachar corrida`)
- [ ] 10. Concluir/cancelar: `POST /corridas/:id/concluir` (`concluida_em`), e `cancelar` de corrida em
  `montando` (libera os pedidos: `corrida_id`/`ordem_parada` nulos). Corrida `despachada` não volta a
  `montando`  (commit: `feat(despacho): concluir e cancelar corrida`)
- [ ] 11. Read-model do painel: `GET /lojas/:lojaId/despacho` devolve pedidos prontos para despachar (não
  atribuídos), corridas abertas com paradas (endereço resumido, valor do motoboy por parada, zona) e
  motoboys ativos com carga atual. Sem N+1 (queries agregadas)  (commit: `feat(despacho): read-model do painel de despacho`)
- [ ] 12. Realtime: emitir eventos SSE nas mutações  (commit: `feat(despacho): eventos em tempo real`)
- [ ] 13. Testes de unidade e integração  (commit: `test(despacho): unidade e integração`)
- [ ] 14. Testes de isolamento e de colunas  (commit: `test(seguranca): despacho e corridas`)

## Testes e segurança exigidos

- Atribuição: motoboy inativo ou de outra loja rejeitado; pedido de retirada rejeitado; nome do motoboy
  gravado como snapshot (renomear o motoboy depois não muda o pedido antigo).
- Corrida: não mistura lojas; pedido em duas corridas rejeitado; reordenar mantém sequência sem buracos;
  `despachar` sem motoboy ou vazia dá 422; despachar duas vezes é no-op.
- Concorrência: dois operadores adicionando o mesmo pedido a corridas diferentes (uma vence, a outra
  recebe 409) via `UPDATE ... WHERE corrida_id IS NULL` / lock por linha.
- O módulo nunca escreve `pedidos.status` nem outras colunas além das quatro de despacho (teste que
  inspeciona os SQL gerados ou usa role com grant por coluna num teste de integração).
- **SEC-001/002:** corrida/pedido/motoboy de outra loja inacessíveis; `loja_id` forjado ignorado.
- **SEC-003:** escopo de operador da plataforma é negado (despacho é conteúdo de loja).
- **SEC-030:** `whaviso_api` sem DELETE em `corridas`.
- SEC-080/081.

## Notas e decisões

- **Transição de status do pedido fica com `API-pedidos`.** Despachar a corrida **não** move os pedidos
  para `saiu_entrega`; isso é a máquina de estados de `API-pedidos`. Coordenação: `API-pedidos` expõe
  uma transição em lote (`POST /pedidos/transicao`) que o front (`FR-entrega`) chama junto com o
  despachar. Pendência a alinhar com `API-pedidos`; se preferirem, uma migration futura pode conceder a
  este módulo `UPDATE (status)` restrito, o que exigiria revisão (não adotado agora).
- **Colunas de despacho de `pedidos`:** o dono declara no `MODULE.md` de `API-pedidos` que
  `motoboy_id, motoboy_nome, corrida_id, ordem_parada` são escritas pelo despacho, e `API-pedidos` não as
  escreve. A fronteira é documental e testada; o banco não a impõe por coluna porque o grant da 0005 é
  da tabela inteira.
- `sugerida = false` sempre aqui; `API-roteiriza` reaproveita a mesma tabela e as mesmas rotas de
  composição, só acrescentando a sugestão. Por isso a composição manual é desenhada como operação sobre
  a corrida, não como estado do módulo.
- Sem mapas nesta onda: `lat/lng` de `enderecos` podem ser nulos; a ordem de parada é decisão humana. O
  read-model já devolve `lat/lng` quando existirem, para a onda 5 acender o mapa sem refazer contrato.
- O valor devido ao motoboy não é calculado aqui: `API-motoboys` o deriva ao fechar o dia, a partir de
  `pedidos.motoboy_id` + `zonas_entrega.valor_motoboy_centavos`.
