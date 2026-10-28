# fiscal (frontend)

## Proposito
Pagina `/fiscal` com tres secoes: **Documentos** (pedidos entregues a emitir + lista NFC-e/NFS-e com
status, chave, link, nova tentativa), **Itens** (dado fiscal por item do catalogo: NCM, CFOP, origem,
unidade e CSOSN/CST, com editor por item e marca de pendentes) e **Emissor** (credencial write-only,
CNPJ, regime, series, ambiente, ativar/desativar e emissao automatica).

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/fiscal'))`).

## Dados (`api.ts`, raiz `['fiscal']`)
- `GET/PUT/PATCH /v1/fiscal/config`, `GET/POST /v1/fiscal/documentos`, `POST /v1/fiscal/documentos/auto`
  (emissao em lote), `GET /v1/fiscal/pedidos-emissiveis`, `GET /v1/fiscal/itens` + `PUT /v1/fiscal/itens/:itemId`.
  Leitura/emissao/dado fiscal: `loja:gerir`; PUT da credencial: so o dono. Contrato `_generated/fiscal`.
- Regime da loja (config) decide o campo de situacao tributaria no editor de item: CSOSN (Simples/MEI) ou CST.

## Segredo
- **Credencial do emissor WRITE-ONLY**: `type="password"`, limpa ao fim do envio; leituras so trazem `ultimos4` mascarado.
  Sem credencial preenchida e com config existente, o formulario usa PATCH (nao reenvia o segredo).

## Notas
- Emissor de terceiro ainda pode ser stub no servidor: documentos ficam `erro` (`emissor: emissor_nao_configurado`); o erro ja vem saneado.
- Link do documento so vira `<a>` se for `https://` (segunda barreira alem da api), com `rel="noopener noreferrer"`.
- Emitir um documento NOVO (primeira vez) parte do pedido (`POST /fiscal/documentos` com `pedido_id`); aqui so a nova tentativa apos erro.
