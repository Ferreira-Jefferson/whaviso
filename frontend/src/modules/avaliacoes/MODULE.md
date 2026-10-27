# avaliacoes (frontend)

## Proposito
Lista de avaliacoes pos-venda (nota 1 a 5 e comentario por pedido entregue) e resumo
(media, total, distribuicao). Somente leitura. Rota `/avaliacoes`.

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/avaliacoes'))`).

## Dados
- `GET /v1/avaliacoes?nota&cursor&limite` (paginacao por cursor, "Ver mais"), `GET /v1/avaliacoes/resumo`.
- Contratos: `@/shared/contracts/_generated/avaliacoes`. Cache: raiz `['avaliacoes']`.

## Regras
- Filtro por nota pelo seletor ou clicando numa linha da distribuicao (o mesmo estado).
- A media vem pronta do backend (2 casas); nao e recalculada.
- O comentario e texto livre do consumidor: so exibido (React escapa), nunca logado.
- Sem telefone; o cliente aparece por nome. Leitura exige `relatorios:ver`.

## Primitivos locais
- `Estrelas` (exibicao de nota), `ResumoAvaliacoes` (media + distribuicao filtravel).
