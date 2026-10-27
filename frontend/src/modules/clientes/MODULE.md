# clientes (frontend)

## Proposito
Cadastro de quem pede na loja ativa. Lista com busca (nome ou telefone), detalhe
(nome, telefone mascarado, resumo de consumo e enderecos) e edicao do nome. Rota `/clientes`.

## Entry points
- `index.ts`: export default da pagina (para `lazy(() => import('@/modules/clientes'))` no registry de rotas).

## Dados
- `GET /v1/clientes` (lista por cursor; query `q`, `cursor`, `limite`), `GET /v1/clientes/:id` (detalhe),
  `PATCH /v1/clientes/:id` (edita `nome`).
- Contratos: `@/shared/contracts/_generated/clientes` (nao redefinir).
- Cache: raiz `['clientes']`; a mutacao de nome invalida essa raiz (lista + detalhe).

## PII (telefone)
- O telefone so e exibido MASCARADO (`telefone_mascarado`, ja mascarado pelo backend).
- A tela NAO usa `POST /:id/telefone/revelar` (revelacao em claro, so dono/gerente):
  a operacao do dia a dia se faz com o numero mascarado.

## Notas
- `q` vazio lista todos; com termo, o backend busca por nome/telefone (hash). Busca com debounce.
- O contrato nao tem campo "observacoes"; so `nome` e editavel (`ClienteAtualizarEntrada`).
- Paginacao por cursor via `useInfiniteQuery` + botao "Ver mais".
- Primitivos novos locais: `useDebounce` (pages/Clientes.tsx) e o `Tile` de metrica
  (components/DetalheClienteDialog.tsx). Candidatos a promover ao design system se reusados.
