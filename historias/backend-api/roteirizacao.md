# API-roteiriza despacho (roteirização)

- **ID:** API-roteiriza  ·  **Área:** API  ·  **Onda:** 5
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Sugerir **corridas otimizadas**: agrupar pedidos prontos para sair juntos por **tempo de preparo +
proximidade geográfica** e ordenar as paradas, usando a interface `ClienteMapas` (geocode + matriz de
tempo). O operador aceita a sugestão como está ou ajusta pelas rotas manuais do despacho básico.

"Pronto" observável: dado um conjunto de pedidos com endereço, `POST /despacho/roteirizacao/sugerir`
devolve corridas sugeridas (grupos e ordem de parada, com tempo total estimado); `aceitar` cria a
`corrida` (`sugerida = true`) e grava `pedidos.corrida_id`/`ordem_parada` de forma atômica; endereços sem
coordenada são geocodificados sob demanda; com o provedor de mapas fora do ar, o módulo degrada para
estimativa por distância em linha reta (sinalizada).

## Dependências

- `API-despacho`: cria/edita `corridas`, atribui motoboy e já escreve `pedidos.corrida_id`; esta
  entrega é uma **sub-fatia** do mesmo módulo e reaproveita as regras de consistência da corrida manual.
- `F2` clientes-externos: interface `ClienteMapas` (`geocode`, `matriz`) com stub e implementação
  OSRM/Nominatim. **Não** chamar provedor por HTTP direto: sempre pela interface (SEC-070).

## Contratos e tabelas que toca

- **Dono de escrita:** `corridas` (já do despacho; aqui `INSERT` com `sugerida=true`), colunas
  `pedidos.corrida_id`/`ordem_parada` (mesmo critério de atomicidade do despacho manual),
  **`enderecos.lat`, `enderecos.lng`, `enderecos.geocodificado_em`** (decisão: esta sub-fatia é a única
  escritora dessas 3 colunas; `clientes` só as zera ao mudar o texto do endereço) e a nova tabela
  `despacho_config`.
- **Lê:** `pedidos` (status `novo|em_preparo`, `modalidade = entrega`, `corrida_id IS NULL`,
  `criado_em`, `zona_id`), `itens_pedido` (apenas contagem), `enderecos` (campos de endereço, lat/lng),
  `lojas`, `zonas_entrega`, `motoboys` (ativos, para capacidade), `despacho_config`.
- **Migration nova `0013_despacho_roteirizacao.sql`** (numeração a confirmar contra as demais migrations
  da onda): tabela `despacho_config` por loja:
  `loja_id uuid pk -> lojas`, `preparo_base_min smallint default 20`, `preparo_por_item_min numeric(4,1)
  default 1.0`, `max_pedidos_corrida smallint default 4`, `janela_saida_min smallint default 10`,
  `desvio_max_min smallint default 8`, `origem_lat/origem_lng numeric(9,6)`, `volta_a_loja boolean
  default false`, timestamps; RLS deny-all + policy/grant só `whaviso_api` (`select, insert, update`).
  Rodar `validate_migrations.sh` e `check_rls_coverage.sh`.
- **Contratos Zod:** `RoteirizacaoSugerirIn` (`pedido_ids?`, `motoboys_disponiveis?`),
  `CorridaSugerida` (`pedidos` ordenados, `tempo_total_min`, `distancia_total_m`, `estimado: boolean`),
  `SemLocalizacao`, `RoteirizacaoAceitarIn`, `DespachoConfigDTO/Patch`.
- **Rotas:** `GET/PUT /despacho/config`, `POST /despacho/roteirizacao/geocodificar-pendentes`,
  `POST /despacho/roteirizacao/sugerir`, `POST /despacho/roteirizacao/aceitar`,
  `POST /despacho/roteirizacao/reordenar` (recalcula só a ordem de uma lista manual).

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/despacho/roteirizacao/**` (algoritmo, serviço, rotas, testes, `MODULE.md`)
- `backend/supabase/migrations/0013_despacho_roteirizacao.sql`
- `backend/packages/shared/src/contracts/roteirizacao.ts`
- `backend/apps/api/src/routes.ts` (1 linha para o plugin da sub-fatia)
- `backend/apps/api/test/security/roteirizacao.*.test.ts`
- **Não** editar `packages/shared/src/clientes_externos/**` (F2). Se faltar operação em
  `ClienteMapas`, abrir pedido na tarefa F2.

## Etapas

- [ ] 1. Confirmar com F2 a assinatura de `ClienteMapas` (`geocode(endereco)`, `matriz(origens, destinos)`
  em minutos e metros, limite de pontos por chamada) e ler o stub; registrar em `MODULE.md`
  (commit: `docs(roteirizacao): contrato de ClienteMapas consumido`)
- [ ] 2. Migration `0013_despacho_roteirizacao.sql` + validação de migrations e RLS
  (commit: `feat(db): configuracao de despacho por loja`)
- [ ] 3. Contratos Zod + `gen_contracts`  (commit: `feat(contracts): contratos de roteirizacao`)
- [ ] 4. Config da loja: `GET/PUT /despacho/config` com upsert, defaults, limites validados
  (`max_pedidos_corrida` 1..10, minutos 0..120)  (commit: `feat(roteirizacao): configuracao de despacho`)
- [ ] 5. Geocodificação: monta consulta **só com campos de endereço** (logradouro, número, bairro,
  cidade, UF, CEP; sem nome nem telefone), chama `ClienteMapas.geocode`, grava `lat/lng/geocodificado_em`
  só quando o resultado cai dentro de uma caixa plausível (UF/cidade da loja; fora = marca falha e
  registra em `eventos`, não grava); processa em lote pequeno com respeito ao limite do provedor (1
  req/s no Nominatim) e backoff  (commit: `feat(roteirizacao): geocodificacao sob demanda`)
- [ ] 6. Cálculo de pronto previsto (`pronto_previsto_em = criado_em + preparo_base + itens *
  preparo_por_item`), função pura  (commit: `feat(roteirizacao): estimativa de preparo`)
- [ ] 7. Matriz de tempos: uma chamada `matriz` para origem (loja) + paradas candidatas; **fallback**
  haversine com velocidade média configurável quando o provedor falha, marcando `estimado = true`
  (commit: `feat(roteirizacao): matriz de tempos com fallback`)
- [ ] 8. Agrupamento `agrupar.ts` puro e determinístico: ordena por `pronto_previsto`; semeia cada
  corrida com o pedido mais urgente; agrega candidatos se (a) `|pronto - pronto_semente| <=
  janela_saida_min`, (b) acréscimo de tempo da inserção de menor custo `<= desvio_max_min`, (c) não excede
  `max_pedidos_corrida`; repete até esgotar  (commit: `feat(roteirizacao): agrupamento por preparo e proximidade`)
- [ ] 9. Ordenação de paradas `ordenar.ts`: vizinho mais próximo a partir da loja + melhoria 2-opt sobre
  a matriz de tempo (caminho aberto, ou fechado se `volta_a_loja`); sem dependência externa de solver
  (commit: `feat(roteirizacao): ordenacao de paradas`)
- [ ] 10. Testes de unidade dos algoritmos com matrizes sintéticas (casos: 1 pedido, empate de
  preparo, pedido distante que não entra, capacidade 1, matriz assimétrica, determinismo com mesma
  entrada)  (commit: `test(roteirizacao): algoritmos de agrupamento e ordenacao`)
- [ ] 11. Serviço `sugerir`: seleciona elegíveis (escopo de loja), separa `sem_localizacao`, geocodifica
  se solicitado, calcula e devolve **sem persistir corrida**  (commit: `feat(roteirizacao): sugerir corridas`)
- [ ] 12. Serviço `aceitar` em transação: `SELECT ... FOR UPDATE` nos pedidos escolhidos; revalida que
  seguem sem corrida e em status elegível (senão 409 listando os conflitantes); `INSERT corridas
  (sugerida=true)`, `UPDATE pedidos SET corrida_id, ordem_parada`; motoboy opcional (ativo, da loja);
  `eventos`  (commit: `feat(roteirizacao): aceitar sugestao de corrida`)
- [ ] 13. `reordenar` para ajuste manual do operador e testes de integração (2 lojas, concorrência de
  `aceitar`, provedor indisponível, endereço sem coordenada)  (commit: `test(roteirizacao): integracao`)
- [ ] 14. Registro em `routes.ts`  (commit: `feat(roteirizacao): registrar rotas`)
- [ ] Testes passando; lint, typecheck, test
- [ ] Revisão (Opus) de SSRF/PII antes de `CONCLUIDO`

## Testes e segurança exigidos

- **SEC-070** (central): nenhuma chamada de mapas sai por fora do `ClienteMapas`; teste de busca falha
  se o módulo importar `fetch`/`undici`/`axios` direto; teste com stub que responde redirect para
  `169.254.169.254`/`localhost` confirma que a chamada é recusada (a garantia vive em F2; aqui o teste
  prova que o módulo não contorna).
- **SEC-001/002**: pedidos de outra loja em `pedido_ids` são ignorados/404; `loja_id` forjado não
  muda o escopo; `aceitar` não atribui motoboy de outra loja.
- **SEC-003**: operador da plataforma recebe 403.
- **SEC-024**: logs não contêm endereço, lat/lng nem consulta de geocode (redaction de `logradouro`,
  `endereco`, `lat`, `lng`).
- **SEC-080/081**: ids em array limitados (máx 50), uuids validados; SQL parametrizado, `= ANY($1)`.
- **SEC-101**: rate limit em `geocodificar-pendentes` e `sugerir` (custo e limite do provedor).
- Unidade/integração: determinismo, atomicidade do `aceitar` (falha no meio não deixa pedido
  meio-atribuído), corrida de dois `aceitar` com pedidos sobrepostos.

## Notas e decisões

- **Algoritmo próprio e simples, não solver externo.** Para lotes de até ~10 paradas, vizinho mais
  próximo + 2-opt sobre matriz de tempo é suficiente, determinístico e testável. Revisitar (OR-Tools)
  só se o volume exigir.
- **Preparo estimado por configuração da loja** (base + por item), porque o cardápio não guarda tempo
  de preparo por item e a base do relógio é `pedidos.criado_em` (não existe timestamp de entrada em
  `em_preparo`). Evolução: `itens.preparo_min` e timestamp de transição, em tarefa de cardápio/pedidos.
- **Sugestão não persiste**; só `aceitar` grava. Evita lixo de corridas `montando` e mantém o operador no
  controle. `sugerida=true` serve para métrica de adoção.
- **Escrita em `enderecos`:** exceção documentada e restrita a 3 colunas; combinar com `API-clientes`
  que o módulo de clientes zere `geocodificado_em`/`lat`/`lng` quando o texto muda.
- **LGPD:** só o endereço textual é enviado ao provedor de geocode, nunca nome/telefone. Provedor
  público (Nominatim) tem política de uso e limite: cache é o próprio `enderecos.lat/lng`.
- Migration nova: ao commitar, **perguntar** se aplica no cloud (`supabase db push`).
