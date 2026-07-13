# categorias (frontend)

## Propósito
Gerência das categorias do usuário (E16): criar, renomear, trocar cor e arquivar
(soft-delete). Categoria organiza combinados por marca/linha; é interna do dono e nunca
aparece para o devedor. Rota `/app/categorias`.

## Entry points
- `index.ts`: `CategoriasPage` (lazy), montada em `/app/categorias` (app/router.tsx).

## Especialistas consumidos
- `@/shared/api_client` (rota `/categorias`), `@/shared/contracts`, `@/shared/ui`.

## Notas
- O SELECT de categoria no formulário de Novo Aviso e o FILTRO no Painel NÃO importam este
  módulo (fronteira do lint): cada um tem seu próprio hook de leitura da rota `/categorias`.
  A raiz de cache `['categorias']` é compartilhada por string, então criar/renomear/arquivar
  aqui revalida aqueles.
