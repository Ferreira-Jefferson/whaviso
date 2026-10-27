# fluxo

## Proposito
Backend do editor visual do grafo de atendimento: a loja guarda fluxos versionados (rascunho,
publicada, arquivada), valida o grafo e publica explicitamente. O motor do atendente executa a versao
publicada do fluxo ativo (a api nao executa nem importa o motor; so analise estatica).

## Entry points
- `index.ts`: `fluxoRoutes` (registry, prefixo `fluxo`).
- Rotas (`/v1/fluxo`): `GET /catalogo`, `GET /`, `POST /`, `GET /:id`, `PUT /:id/rascunho`,
  `POST /:id/rascunho/validar`, `POST /:id/rascunho/publicar`, `POST /:id/ativar|desativar`,
  `GET /:id/versoes`, `GET /:id/versoes/:versao`, `POST /:id/versoes/:versao/restaurar`.
- Leitura: qualquer papel (`pedidos:gerir`). Editar/publicar/ativar: dono/gerente (`loja:gerir`).

## Tabelas
- dono de: `fluxos`, `fluxo_versoes` (migration 0049; sem DELETE; grafo fora do rascunho imutavel por trigger).
- escreve: `eventos` (`fluxo.rascunho_criado|publicado|restaurado|ativado|desativado`; so ids e numero da versao).

## Contratos
`@whaviso/shared/contracts` (`fluxo.ts`): grafo, catalogo fechado de nodes (descritores no formato do
NodeContract, sem `executar`), validacao, DTOs, `FLUXO_PADRAO`.

## Invariantes
- Validador puro (`validar.ts`), no servidor, na publicacao: tipo no catalogo, config pelo Zod do node,
  conexoes validas (1 por handle), inicio, alcancabilidade, saida/ciclo sem saida, node obrigatorio e
  acao irreversivel so apos `confirmar`. Falha = 422 `grafo_invalido`.
- Publicar e atomico (fluxo travado): arquiva a anterior, rascunho vira publicada. Um rascunho e uma publicada por fluxo.
- Um fluxo ativo por loja; ativar exige versao publicada. Multi-tenant por `loja_id` do escopo.
