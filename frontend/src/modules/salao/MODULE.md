# salao (frontend)

## Proposito
Controle de salao da loja ativa numa so tela (`/salao`): grade de mesas com estado
(livre/ocupada/inativa) e, ao lado, o painel da comanda aberta.
- **Mesas**: cadastrar/editar (nome e lugares), ativar/desativar.
- **Comandas**: abrir numa mesa livre, lancar itens (quantidade), ver o total e fechar.

## Entry points
- `index.ts`: export default da pagina (para `lazy(() => import('@/modules/salao'))` no registry).

## Dados (`api.ts`, raiz de cache `['salao']`)
- `GET /v1/salao/mesas` (mesas + comanda aberta de cada uma, com `comanda_aberta_id` e total).
- `GET /v1/salao/comandas/:id` (detalhe: itens lancados + total).
- `POST /v1/salao/mesas`, `PATCH /v1/salao/mesas/:id`.
- `POST /v1/salao/comandas` (abrir `{ mesa_id }`), `POST /v1/salao/comandas/:id/itens`
  (lancar `{ item_id, quantidade }`), `POST /v1/salao/comandas/:id/fechar`.
- Contratos: `@/shared/contracts/_generated/salao` (nao redefinir). Toda mutacao invalida `['salao']`.

## Notas
- Dinheiro em centavos: `formatarCentavos` exibe. O preco NUNCA vem do cliente; o servidor
  grava o snapshot de nome/preco a partir do cardapio. A UI so manda `item_id` e `quantidade`.
- Estado da mesa e sempre derivado do servidor (`estados.ts`): `comanda_aberta_id` != null = ocupada;
  `ativo` false = inativa; senao livre. Nada decidido no cliente.
- **Limitacao conhecida (lancar item)**: o contrato do salao nao expoe a lista de itens do
  cardapio e este modulo nao pode importar o modulo `cardapio` (fronteira feature-first). Por isso
  o item e informado pelo seu id (UUID) no `LancarItemDialog`. Quando o contrato do salao passar a
  expor a lista de itens, trocar o campo por um seletor de item.
- Fechar comanda e pessimista (`ConfirmDialog`): encerra a comanda e a mesa volta a ficar livre.
- Primitivos locais candidatos a `@/shared/ui`: o stepper de quantidade do `LancarItemDialog`
  (controle numerico +/- com alvos de 44px) nao existe em `@/shared/ui`; se repetir noutra tela,
  promover como `Stepper`/`QuantidadeInput`.
