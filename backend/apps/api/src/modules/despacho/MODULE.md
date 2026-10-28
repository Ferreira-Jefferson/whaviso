# despacho

## Proposito
Despacho **manual** (basico): atribuir motoboy a um pedido e montar a **corrida** (1 motoboy, N pedidos,
ordem de parada definida a mao). Roteirizacao automatica e de outra onda (`sugerida` e sempre `false`).
Fonte: `historias/backend-api/despacho.md`.

## Entry points
- `index.ts`: `despachoRoutes` (registry em `src/routes.ts`, prefixo `despacho`).
- Rotas finais (`/v1/despacho`, loja pelo header `x-loja-id`, todas `conteudo_de_loja` + `pedidos:gerir`):
  - `GET /`: painel (pedidos prontos sem motoboy, corridas abertas com paradas e valor do motoboy, motoboys ativos com carga).
  - `POST /pedidos/:id/motoboy` `{ motoboy_id }` e `POST /pedidos/:id/motoboy/remover`.
  - `POST /corridas` `{ motoboy_id?, pedido_ids? }`, `GET /corridas/:id`.
  - `POST /corridas/:id/pedidos` `{ pedido_ids }`, `POST /corridas/:id/pedidos/:pedidoId/remover`.
  - `PUT /corridas/:id/ordem` `{ pedido_ids }` (lista completa), `POST /corridas/:id/motoboy` `{ motoboy_id }`.
  - `POST /corridas/:id/despachar`, `/concluir`, `/cancelar`.

## Tabelas
- dono de escrita: `corridas` (0007; sem DELETE).
- escreve em `pedidos` as 4 colunas de despacho (`motoboy_id`, `motoboy_nome`, `corrida_id`, `ordem_parada`)
  e, SO no `despachar`, move `status` `em_preparo -> saiu_entrega` dos pedidos da corrida (ver Regras). Fora
  do `despachar` nao toca `status`; a maquina de estados continua sendo do modulo pedidos.
- le (read-model, sem importar modulo): `pedidos`, `enderecos`, `zonas_entrega` (valor do motoboy), `motoboys`, `pessoas`.
- auditoria em `eventos` (`pedido.motoboy_atribuido|trocado|removido`, `corrida.criada|pedidos_adicionados|pedido_removido|reordenada|motoboy_atribuido|motoboy_trocado|despachada|concluida|cancelada`); `detalhes` so com ids e `user_id`.

## Regras
- Atribuicao individual: pedido de entrega em `novo|em_preparo|saiu_entrega`, motoboy ativo da loja; nome gravado
  como snapshot. `entregue` = 409 `pedido_entregue`; pedido numa corrida = 409 `pedido_em_corrida` (troca pela corrida).
- Compor corrida: so `novo|em_preparo`, entrega, sem outra corrida; `ordem_parada` sequencial sem buracos; so em `montando`
  (senao 409 `corrida_imutavel`). Concorrencia: `FOR UPDATE` na corrida e nos pedidos + `UPDATE ... WHERE corrida_id IS NULL`.
- Corrida com motoboy propaga o nome/id a todos os pedidos (inclusive os adicionados depois).
- `despachar`: exige motoboy (422 `corrida_sem_motoboy`) e >= 1 pedido (422 `corrida_vazia`); idempotente. Ao
  sair a corrida, move os pedidos preparados para `saiu_entrega` na mesma transacao. O guarda `status = 'em_preparo'`
  espelha a UNICA origem que a maquina de estados do pedido admite para `saiu_entrega` (sem retrocesso; pedido
  ainda `novo`/nao preparado nao e arrastado). Idempotente (num re-despacho `despachar` ja retorna cedo). Para a
  coordenacao generica (front/painel movendo status em lote) existe `POST /v1/pedidos/transicao` no modulo pedidos.
- `concluir`: so despachada (409 `corrida_nao_despachada`); idempotente.
- `cancelar`: so em `montando`; libera pedidos (e o motoboy que veio da corrida) e encerra a corrida como `concluida`
  sem `despachada_em`, exposta como `cancelada: true` (sem DELETE e sem novo valor de enum; evita migration).
- Valor do motoboy por parada = `zonas_entrega.valor_motoboy_centavos` da zona do pedido (leitura viva, centavos).

## Realtime
Reusa o canal existente `pedido.atualizado` (ids + status, sem PII) a cada pedido afetado. Eventos proprios
`corrida.atualizada` e `pedido.motoboy_atribuido` exigem estender `contracts/eventos.ts` (fora deste modulo).

## Fora de escopo
Transicoes de status do pedido fora do `despachar` (sao do modulo pedidos), roteirizacao/mapas, fechamento do dia (modulo motoboys).
