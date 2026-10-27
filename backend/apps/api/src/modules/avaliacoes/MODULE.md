# avaliacoes

## Proposito
Avaliacao pos-venda do consumidor sobre o pedido entregue: nota 1..5 e comentario opcional, uma por
pedido. A loja le a lista e os agregados (media e distribuicao). Hoje e so API: o registro vem por
um endpoint interno; a ponte pela conversa do consumidor e uma integracao posterior.

## Entry points
- `index.ts`: `avaliacoesRoutes` (registry, prefixo `avaliacoes`).
- Rotas finais (`/v1/avaliacoes`): `GET /` (filtro `nota`, cursor), `GET /resumo`, `GET /:id`, `POST /`.

## Especialistas consumidos
- `@whaviso/shared/db`, `shared/http_errors`, `shared/tenant` (escopo e permissao via `app.escopoLoja`).

## Tabelas
- dono de: `avaliacoes` (append-only: SELECT/INSERT; sem UPDATE/DELETE; `pedido_id` unico).
- le de: `pedidos` (codigo, status, cliente_id), `clientes` (so nome; nunca telefone).
- escreve: `eventos` (`avaliacao.registrada`; `detalhes` so com `user_id` e `nota`, nunca o comentario).

## Contratos
- Zod em `@whaviso/shared/contracts` (`contracts/avaliacoes.ts`, espelhar no front).

## Regras
- Registro: pedido da loja, `status = entregue`, com cliente; senao 422 (`pedido_nao_entregue`,
  `pedido_sem_cliente`) ou 404. Segunda avaliacao do mesmo pedido: 422 `avaliacao_ja_registrada`.
- Leitura: `relatorios:ver` (dono/gerente). Registro interno: `pedidos:gerir`.
- Comentario e texto livre do consumidor: nunca logado.
