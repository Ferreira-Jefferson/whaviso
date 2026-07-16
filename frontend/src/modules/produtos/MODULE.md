# produtos (frontend)

## Propósito
Aba Produtos da Gestão (E17): CRUD do catálogo do dono (nome + preço de venda), em modal. O
produto é interno do dono; nunca vai para a outra pessoa. Editar o nome propaga o rótulo aos
combinados que o usam (servidor); o preço não propaga (snapshot congelado).

## Entry points
- `index.ts`: `ProdutosPage` (lazy). Rota `/app/gestao/produtos` (aba da Gestão).
- `pages/Produtos.tsx`: lista + botão adicionar.
- `components/ProdutoModal.tsx`: criar/ver/editar/arquivar (via ModalPortal).
- `api.ts`: `useProdutos` / `useCriarProduto` / `useAtualizarProduto` (key `['produtos']`).

## Especialistas consumidos
- `@/shared/ui`, `@/shared/contracts`, `@/shared/api_client`

## Notas
- A key `['produtos']` é compartilhada por STRING com o autocomplete do pedido (módulo avisos):
  criar/editar aqui invalida lá, sem import cruzado (fronteira do lint).
