# API-zonas zonas_entrega

- **ID:** API-zonas  ·  **Área:** API  ·  **Onda:** 3
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Cadastro das zonas de entrega da loja: cada zona (bairro, polígono ou raio) define a **taxa cobrada do
cliente** e o **valor pago ao motoboy**. Também resolve "este endereço cai em qual zona e quanto custa a
entrega", que precifica o pedido.

"Pronto" observável: CRUD de zonas com validação por tipo; `POST .../zonas/resolver` recebe bairro (ou
coordenadas) e devolve a zona e os dois valores; zonas sobrepostas têm regra de desempate determinística;
desativar zona não quebra pedidos antigos (que guardam o valor no momento).

## Dependências

- `F4` api-core: server, registry, http_errors, tenant, `shared/db`.
- `F6` front-shell: contrato gerado consumido pela tela de zonas (`FR-entrega`).

## Contratos e tabelas que toca

- **`zonas_entrega`**: este módulo é **dono de escrita** (grants da 0007: `whaviso_api` select/insert/
  update; sem DELETE, "remover" = `ativo = false`). O `whaviso_atendente` só **lê** (precifica o pedido
  na conversa).
- **Lê:** `lojas.area_entrega` (limite geral de atendimento, para avisar zona fora da área) e, para a
  análise de impacto, contagem de `pedidos` por `zona_id` (read-model, só `count`).
- Contratos Zod: `ZonaEntrada` (união discriminada por `tipo`: `bairro` exige `bairro`; `poligono` exige
  GeoJSON `Polygon`; `raio` exige `centro {lat,lng}` + `metros`), `ZonaSaida`, `ResolverZonaEntrada`,
  `ResolverZonaSaida` (`zona_id`, `taxa_cliente_centavos`, `valor_motoboy_centavos`).
- Constraints do banco já existentes: valores >= 0 e coerência `tipo`/`bairro`/`area` (CHECK
  `zonas_definicao`).
- O pedido grava `taxa_entrega_centavos` e `zona_id` **no momento da criação** (snapshot de valor); mudar a
  zona depois não reescreve pedido antigo.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/zonas_entrega/**`
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/packages/shared/src/contracts/zonas_entrega/**`
- `backend/packages/shared/src/geo/**` (função pura de ponto-em-polígono e distância haversine, só se o
  kernel ainda não tiver; é compartilhada com `API-roteiriza` e com o atendente)
- `backend/apps/api/test/**/zonas_entrega*`

## Etapas

- [ ] 1. Scaffold do módulo e registro em `routes.ts`  (commit: `feat(zonas): scaffold do módulo`)
- [ ] 2. Contratos Zod discriminados por tipo, com limites (nome <= 80, taxa e valor inteiros >= 0 e
  teto sanitário, polígono com >= 4 pontos fechado, raio > 0 e <= limite); `gen_contracts`
  (commit: `feat(contratos): zonas de entrega`)
- [ ] 3. Utilitário geo puro (`pontoNoPoligono`, `distanciaMetros`) com testes de borda (ponto na
  aresta, polígono côncavo)  (commit: `feat(shared): geometria básica para zonas`)
- [ ] 4. Repo (SQL parametrizado, sempre com `loja_id`): listar, buscar, inserir, atualizar,
  `ativo`  (commit: `feat(zonas): repositório`)
- [ ] 5. Normalização de bairro: chave de comparação sem acento/caixa/espaços extras (`normalizarBairro`, calculada no service, sem coluna nova)
  ; unicidade lógica por `(loja_id, bairro normalizado)` entre zonas ativas de tipo bairro,
  checada no service (409 em duplicata)  (commit: `feat(zonas): normalização e unicidade de bairro`)
- [ ] 6. CRUD de rotas: `GET/POST /lojas/:lojaId/zonas`, `GET/PATCH /zonas/:id`, `POST /zonas/:id/ativar` e
  `desativar`; papéis `dono` e `gerente` escrevem, `atendente` lê  (commit: `feat(zonas): rotas de CRUD e papéis`)
- [ ] 7. Resolver zona: dado `bairro` e/ou `lat/lng`, escolhe a zona. Ordem de desempate fixa: (1) bairro
  exato, (2) polígono contendo o ponto, (3) raio contendo o ponto; entre iguais, vence a de **menor
  taxa do cliente** e depois a mais antiga. Sem zona: resposta `fora_da_area` sem erro 500
  (commit: `feat(zonas): resolver zona de um endereço`)
- [ ] 8. Aviso de impacto ao desativar/alterar valor: devolve quantos pedidos em aberto usam a zona
  (não bloqueia; pedidos antigos têm snapshot)  (commit: `feat(zonas): aviso de impacto`)
- [ ] 9. Importação rápida de bairros (lista em lote com taxa/valor padrão), transacional, rejeita o
  lote inteiro se houver duplicata  (commit: `feat(zonas): criação em lote de bairros`)
- [ ] 10. Testes de unidade e integração  (commit: `test(zonas): unidade e integração`)
- [ ] 11. Testes de isolamento e privilégio  (commit: `test(seguranca): zonas de entrega`)

## Testes e segurança exigidos

- Validação por tipo (cada combinação inválida rejeitada), valores negativos ou não inteiros rejeitados
  (centavos), polígono não fechado rejeitado.
- Resolver: bairro com acento/caixa diferente casa; ponto em polígono/raio; sobreposição resolve de forma
  determinística; fora da área devolve `fora_da_area`.
- Desativar zona: some do `resolver`, continua visível no histórico de pedido.
- **SEC-001/002:** zona de outra loja inacessível; `loja_id` forjado ignorado.
- **SEC-030:** `SET ROLE whaviso_api` sem DELETE em `zonas_entrega`; atendente só SELECT.
- **SEC-081:** payload fora do contrato (tipo desconhecido, GeoJSON malicioso/gigante) rejeitado; limite
  de pontos do polígono evita DoS.
- SEC-080: nenhuma query concatenada.

## Notas e decisões

- Dinheiro em centavos inteiros; `valor_motoboy_centavos` pode exceder a taxa do cliente (a loja pode
  subsidiar); não impomos relação entre os dois, só exibimos o diferencial no painel.
- Coordenadas só existem se o endereço estiver geocodificado (`ClienteMapas`, onda 5). Até lá o `resolver`
  funciona por **bairro**; polígono/raio ficam cadastráveis, mas só resolvem quando houver `lat/lng`.
- O módulo expõe `resolver` por REST para o painel; o atendente faz a mesma resolução lendo
  `zonas_entrega` direto (grant de SELECT) com a função geo pura do kernel, sem chamar a api.
- Zona não tem DELETE por regra da casa; "excluir" na UI é desativar.
