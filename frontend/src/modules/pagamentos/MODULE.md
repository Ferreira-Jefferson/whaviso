# pagamentos (frontend)

## Proposito
Pagina `/pagamentos` com duas secoes: **Cobrancas** (lista Pix por status, ver BR Code copia e cola,
marcar pago/conciliar, cancelar pendente) e **Chave Pix** (metadado da chave atual + cadastro/troca).

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/pagamentos'))`).

## Dados (`api.ts`, raiz `['pagamentos']`)
- `GET/PUT /v1/pagamentos/pix`, `GET /v1/pagamentos` (`?status`), `POST /v1/pagamentos/:id/conciliar`,
  `POST /v1/pagamentos/:id/cancelar`. Permissao `loja:gerir`. Contrato `_generated/pagamentos`.

## Segredo
- **Chave Pix WRITE-ONLY**: so `ultimos4` (mascarada) volta; o campo da chave e limpo ao fim do envio
  e a resposta so grava metadado em cache. A validacao por tipo usa o proprio `LojaPixEntrada`.
- **`br_code`**: exibido so no `BrCodeDialog` para copiar; nao entra em log, URL, storage nem query key.

## Notas
- Cobranca so tem `pedido_id` (sem codigo do pedido): a tela mostra os 6 ultimos caracteres como referencia curta.
- Expiracao e preguicosa no servidor: o status vem pronto; o cliente nao o recalcula.
- Criar cobranca (`POST /pagamentos/pedidos/:pedidoId`) nao tem tela aqui: parte do pedido/conversa.
