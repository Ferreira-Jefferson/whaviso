# cardapio (frontend)

## Propósito
Gerência do cardápio da loja ativa. Duas seções numa só tela (`/cardapio`):
- **Cardápio**: árvore categorias -> itens. Criar/editar categoria e item, ligar/desligar item
  (disponibilidade) e mudar preço (em centavos).
- **Grupos de opções**: biblioteca de grupos (tamanho/adicional/personalizado) e suas opções.
  Criar/editar grupo e opção, ligar/desligar opção e mudar preço de acréscimo.
- **Importar cardápio** (foto/PDF): botão "Importar" no header abre o fluxo num modal
  (`components/ImportarCardapioDialog`), não é mais rota/módulo próprio. Enviar o arquivo,
  acompanhar a leitura, revisar o rascunho e aprovar; o lote aprovado cai na árvore `['cardapio']`.
  Código em `importacao/` (api, aplicarLote, estados, components). Absorvido do antigo módulo
  `cardapio_importacao`, que deixou de existir (telas soltas que são parte do cardápio moram aqui).

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/cardapio'))` no registry).

## Dados (`api.ts`, raiz de cache `['cardapio']`)
- `GET /v1/cardapio` (árvore resolvida do painel, com flags `ativo`/`disponivel`/`disponivel_agora`/`pedivel`).
- `GET /v1/cardapio/grupos` (biblioteca de grupos com opções).
- Categorias: `POST /v1/cardapio/categorias`, `PATCH /v1/cardapio/categorias/:id`.
- Itens: `POST /v1/cardapio/itens`, `PATCH /v1/cardapio/itens/:id`, `POST /v1/cardapio/itens/:id/disponibilidade`.
- Grupos: `POST /v1/cardapio/grupos`, `PATCH /v1/cardapio/grupos/:id`.
- Opções: `POST /v1/cardapio/grupos/:id/opcoes`, `PATCH /v1/cardapio/opcoes/:id`, `POST /v1/cardapio/opcoes/:id/disponibilidade`.
- Contratos: `@/shared/contracts/_generated/cardapio` (não redefinir). Toda mutação invalida `['cardapio']`.

## Notas
- Dinheiro em centavos: `MoneyInput` emite centavos, `formatarCentavos` exibe. Nunca `parseFloat`.
- Disponibilidade é decidida pelo servidor (a UI só envia `{ ativo }`); as flags da árvore mandam no visual.
- Reordenação (endpoints `PUT .../ordem`) ainda não tem UI aqui; a ordem vem do servidor.
- Vínculos de grupo por categoria/item (herança/exceção) ainda não têm UI aqui.
- Usa os primitivos compartilhados `Switch` e `Textarea` de `@/shared/ui` (antes eram copias locais, ja consolidadas).
- Importação (`importacao/api.ts`, raiz de cache `['cardapio_importacao']`): `POST/GET /v1/cardapio-importacao`,
  `GET/PATCH /:id`, `POST /:id/aprovar`, `POST /:id/descartar`; contrato `_generated/cardapio_importacao`.
  Arquivo/rascunho nunca vão para log. Aprovar aplica o lote e invalida `['cardapio']`.
