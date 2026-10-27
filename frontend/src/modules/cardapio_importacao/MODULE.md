# cardapio_importacao (frontend)

## Proposito
Pagina `/cardapio-importacao`: enviar foto/PDF do cardapio (base64, ate 10 MB), acompanhar o job
(fila -> processando -> rascunho_pronto | erro), revisar/editar o rascunho extraido
(categorias > itens > grupos > opcoes, selo "Revisar" para confianca < 0,7), aprovar ou descartar.

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/cardapio_importacao'))`).

## Dados (`api.ts`, raiz `['cardapio_importacao']`)
- `POST/GET /v1/cardapio-importacao`, `GET/PATCH /:id`, `POST /:id/aprovar`, `POST /:id/descartar`.
  Permissao `loja:gerir`. Contrato `_generated/cardapio_importacao`.
- Lista e detalhe fazem polling (4 s) enquanto o job esta em `fila`/`processando`.

## Aplicar o lote no cardapio (`aplicarLote.ts`)
`aprovar` devolve o LOTE; a importacao nao escreve no cardapio. A tela aplica o lote pelos endpoints
REST do cardapio (HTTP + contrato `_generated/cardapio`, sem importar o slice): `POST /cardapio/categorias`,
`POST /cardapio/itens`, `POST /cardapio/grupos` (com opcoes) e `PUT /cardapio/itens/:id/grupos`
(excecao `incluir: true`). Retomavel: o `Progresso` em memoria guarda ids ja criados; "Tentar de novo"
nao duplica. Ao concluir, invalida `['cardapio']`.

## Notas
- Aprovar e irreversivel no servidor (reaprovar = 409, arquivo zerado): se a pagina for fechada no meio
  da aplicacao, o lote em memoria se perde (a UI avisa "Nao feche esta pagina"). Ideal: porta em lote
  atomica no backend (`CardapioLoteEntrada`, citada no MODULE.md da api).
- Arquivo, rascunho e erro nao vao para log. Mensagem de erro do job e fixa por codigo (vem do servidor).
