# zonas_entrega

## Proposito
Zonas de entrega da loja: cada zona (bairro, poligono ou raio) define a **taxa cobrada do cliente**,
o **valor pago ao motoboy**, o **pedido minimo** e o **frete gratis acima de** (tudo em centavos).
Tambem resolve "este endereco cai em qual zona e quanto custa a entrega", que precifica o pedido.
Fonte: `historias/backend-api/zonas_entrega.md`.

## Entry points
- `index.ts`: `zonasEntregaRoutes` (registry em `src/routes.ts`, prefixo `zonas`).
- Rotas finais (`/v1/zonas`, loja pelo header `x-loja-id`):
  - `GET /` (`?incluir_inativas=true`), `GET /:id`: qualquer papel da loja.
  - `POST /`, `PATCH /:id`, `POST /:id/ativar`, `POST /:id/desativar`, `POST /lote`: `loja:gerir`
    (dono e gerente).
  - `POST /resolver`: qualquer papel (o atendente precifica a entrega na conversa).

## Permissoes
Escrita exige `loja:gerir`; leitura e `resolver` so exigem escopo de loja (atendente le).

## Tabelas
- dono de: `zonas_entrega` (migrations 0007 e 0030). `whaviso_api` select/insert/update; **sem DELETE**
  ("excluir" = `ativo = false`). `whaviso_atendente` so SELECT (le direto, sem chamar a api).
- le de: `pedidos` (so `count` de pedidos em aberto por `zona_id`: `novo`, `em_preparo`, `saiu_entrega`).
- escreve auditoria em `eventos` (`zona.criada|atualizada|ativada|desativada`; `detalhes` so com
  `user_id`, tipo e NOMES de campos, sem PII).

## Contratos
Zod em `@whaviso/shared/contracts/zonas_entrega` (reexportado em `schemas.ts`; `:id` fica local).
`ZonaEntrada` e uniao discriminada por `tipo`: `bairro` exige `bairro`; `poligono` exige `area`
GeoJSON Polygon (anel unico fechado, 4 a 200 pontos, `[lng, lat]`); `raio` exige `centro {lat,lng}` +
`metros` (1 a 100000; gravado em `area` como `{ centro, metros }`). Corpo com `loja_id` ou chave
extra e rejeitado (400, strictObject). jsonb `area` e sempre lido por schema (SEC-081).

## Decisoes
- `pedido_minimo_centavos` e `frete_gratis_acima_centavos`: nullable (null = sem regra). O modulo so
  os guarda e devolve (zona e no `resolver`); a aplicacao no total do pedido e do modulo de pedidos.
- Bairro: chave de comparacao `normalizarBairro` (sem acento, caixa e espacos extras), calculada no
  service (sem coluna). Unicidade logica por loja entre zonas ATIVAS de tipo bairro, checada sob
  advisory lock por loja; duplicata = 409 `bairro_duplicado` (tambem ao reativar e no lote).
- `resolver`: desempate fixo (1) bairro exato, (2) poligono contendo o ponto, (3) raio contendo o ponto;
  entre iguais, menor taxa do cliente e depois a mais antiga. Sem zona: `{ fora_da_area: true }`
  (200, nunca 500). Poligono e raio so resolvem com `lat`/`lng`.
- Aviso de impacto: `pedidos_em_aberto` em todo `ZonaSaida`; nao bloqueia (pedido guarda o valor
  no momento da criacao).
- Geometria pura (`geo.ts`: ponto-em-poligono, haversine, normalizarBairro) fica no modulo ate
  haver segundo consumidor (roteirizacao/atendente), quando sobe para o kernel compartilhado.
- As zonas sao a fonte unica da area de entrega da loja (a coluna legada `lojas.area_entrega` foi
  removida na 0062): um endereco fora de qualquer zona ativa nao e atendido.
