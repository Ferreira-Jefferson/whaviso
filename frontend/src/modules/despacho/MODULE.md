# despacho (frontend)

## Propósito
Painel de despacho da loja ativa (`/despacho`, grupo entrega), uma tela só:
- **Prontos para sair**: pedidos de entrega sem motoboy e sem corrida. Cada um pode receber um
  motoboy direto (entrega avulsa) ou ser marcado para montar/estender uma corrida.
- **Corridas**: 1 motoboy, N pedidos, ordem de parada. Em `montando`: trocar motoboy, reordenar
  (subir/descer), tirar parada, despachar, cancelar. Em `despachada`: concluir.
- **Motoboys**: carga de cada motoboy ativo (corridas e pedidos em aberto).

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/despacho'))`).

## Dados (`api.ts`, raiz de cache `['despacho']`)
- `GET /v1/despacho` (painel; refetch automático a cada 20s), `POST /v1/despacho/pedidos/:id/motoboy`,
  `POST /v1/despacho/corridas`, `POST /v1/despacho/corridas/:id/pedidos`,
  `POST /v1/despacho/corridas/:id/pedidos/:pedidoId/remover`, `PUT /v1/despacho/corridas/:id/ordem`,
  `POST /v1/despacho/corridas/:id/motoboy`, `POST /v1/despacho/corridas/:id/despachar|concluir|cancelar`.
- Contratos: `@/shared/contracts/_generated/despacho` (+ `enums`, só leitura). Toda mutação invalida
  a raiz.

## Notas
- O status do pedido nunca muda aqui (é do módulo pedidos). Regras de negócio (pedido já em corrida,
  corrida imutável, corrida sem motoboy/vazia) são da api: as mensagens 409/422 voltam num `Banner`.
- Corrida cancelada = `status: concluida` + `cancelada: true` (`estadoDaCorrida`).
- Reordenar manda a lista COMPLETA na nova ordem (PUT). Botões subir/descer (sem arrastar) para
  funcionar bem no toque e no teclado.
- Endereço só como resumo/bairro; nenhum telefone ou nome de cliente trafega nesta tela.
- Roteirização automática (sugestão) é outro módulo (`/roteirizacao`); uma corrida aceita de lá
  aparece aqui com o selo "Sugerida".
- Sem primitivo novo: só `@/shared/ui`. Módulo não importa módulo.
