# STATUS: quadro mestre do rebuild

Inventário de módulos, dependências e ondas. É o ponto de partida de qualquer subagent. O **status
vivo de cada tarefa** mora no arquivo do seu módulo (coluna "arquivo"); esta tabela é o **mapa de
dependências e a ordem**. Protocolo de execução: ver [README.md](README.md).

> **Não é MVP.** Todo módulo listado é construído e vai para produção; as ondas são **ordem de
> execução** por dependência (para paralelizar), nunca corte de escopo.

**Status:** `A FAZER` · `EM ANDAMENTO (rótulo)` · `CONCLUIDO`. Mude aqui só o status de módulo; o
detalhe por etapa fica no arquivo do módulo.

**Áreas:** `F` fundação · `API` painel/console (backend) · `ZAP` transporte · `AT` atendente (IA) ·
`FR` frontend · `P` plataforma (operador) · `SEC` segurança.

**Regra de ouro:** não comece um módulo com dependência não `CONCLUIDO`. Se travar, pegue outro módulo
pronto para começar e volte depois. Nunca dois agentes no mesmo módulo.

---

## Estado real (2026-10-27): Ondas 1-5 construídas, integradas e verdes

> Este bloco é a leitura autoritativa; onde uma célula "Status" de linha abaixo ainda disser `A FAZER`,
> ela está **obsoleta** (as tabelas por onda nasceram como mapa de dependências, não como quadro vivo).
>
> **Backend + frontend completos e no git (branch `development`).** Gate integral verde: backend
> typecheck + lint; suíte `npm test` (api 941, atendente 255, zap 65, shared 205) + `test:security`
> (209, 0 skipped/0 todo) contra `whaviso_dev` recriado com as migrations 0052-0057; frontend typecheck
> + lint + build (SEC-025 ok). Todas as 39 telas são reais.
>
> - **Onda 2 (IA):** CONCLUIDA (tabela abaixo atualizada). config-llm, llm_client, entender, rag,
>   conhecimento, cardapio_importacao, importar, tools, harness ja existiam; fechado agora o
>   `retroalimentar_base` (produtor do laco RAG) e as tools `cliente_cadastrar`/`tempo_de_entrega`.
>   Guardrails SEC-060..067 implementados e testados. Motor consome o fluxo publicado e respeita loja pausada.
> - **Onda 3 (entrega):** zonas, motoboys, pagamentos, despacho prontos. Fechado G9 (forma de pagamento +
>   troco), G7 (pausar loja + capacidade), repetir pedido inteiro, despacho -> saiu_entrega em lote.
> - **Onda 4 (negocio/plataforma):** dashboard, campanhas, avaliacoes, promocoes, relatorios, custos,
>   plataforma_* prontos. Fechado o handoff humano ponta a ponta (assumir/devolver, status aguardando,
>   botao no painel) e o rate-limit de frequencia de campanha.
> - **Onda 5 (avancado):** roteirizacao e fluxo (builder) prontos; ClienteMapas real (Nominatim/OSRM) +
>   resiliencia; mapa de despacho (Leaflet) e canvas do fluxo (React Flow); baixa de estoque/insumo na
>   efetivacao do pedido (trigger); adapters reais ClienteFiscal (Focus NFe) e ClienteCanal (iFood),
>   env-gated com fallback ao stub.
> - **Seguranca/CI:** rastreabilidade enxerga os testes de modulo; catalogo atualizado; RES-001 e SEC-042
>   escritos; pgvector no CI (a cobertura vetorial do RAG passa a rodar no PR).
>
> **Residuais documentados (dependem de decisao/credencial/hardware do dono, nao bloqueiam o build):**
> Pix na conversa (exige o grant SEC-032 de SELECT do atendente em `loja_pix`, retido para revisao de
> seguranca do dono) · KDS + ClienteImpressora ESC/POS (hardware) · caminho de foto do cliente (visao
> multimodal no laco) · rewiring de topologia do fluxo por handles de aresta (evolucao do NodeContract) ·
> cobranca franquia + excedente (decisao de preco; spec atual = fixo) · go-live fiscal/iFood (conta e
> credenciais do provedor + campos fiscais por item NCM/CFOP/CSOSN vindos do catalogo).
>
> **Pendencia de deploy:** `supabase db push` das migrations 0052-0057 no cloud (acao de producao, via
> fluxo de deploy; o runtime dev aponta para o cloud, entao as colunas/enums novos so valem la apos o push).

## Onda 0: Fundação (quase tudo depende daqui)

> **FUNDAÇÃO CONCLUÍDA** (F0..F7 todos `CONCLUIDO`). Gate verde ponta a ponta: lint + typecheck +
> `npm test` (api 82, atendente 5, zap 26, shared 115) + `test:security` (105) + `check:contracts`.
> A Onda 1 (laço do pedido) pode abrir em paralelo, cada módulo de backend no seu banco de teste.

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| F0  | db-baseline | Schema multi-tenant, roles, RLS, grants por coluna | — | — | 00-fundacao/db-baseline.md | CONCLUIDO |
| F1  | kernel-contratos | Zod fonte única + NodeContract + eventos + codegen `gen_contracts` | F0 | Sonnet | 00-fundacao/kernel-contratos.md | CONCLUIDO (enums/primitivos/pix/NodeContract/eventos + codegen verde; AGENTS doc coberta por F4) |
| F2  | clientes-externos | Interfaces `ClienteWhats`/`ClienteLLM`/`ClienteMapas` (contratos + stubs) | F1 | Sonnet | 00-fundacao/clientes-externos.md | CONCLUIDO |
| F3  | tenant-auth | JWT/JWKS local, escopo de loja (membros) e de operador | F0, F1 | Opus | 00-fundacao/tenant-auth.md | CONCLUIDO (revisao Opus ok) |
| F4  | api-core | server/app/routes registry, http_errors, config, logger, fronteira `shared/db` | F0, F1, F3 | Sonnet | 00-fundacao/api-core.md | CONCLUIDO |
| F5  | realtime-sse | SSE na api sobre `LISTEN/NOTIFY` do Postgres | F4 | Sonnet | 00-fundacao/realtime-sse.md | CONCLUIDO |
| F6  | front-shell | SPA shell, api_client, auth (login), `_generated`, ui kit, tenant/branding, realtime client | F1, F4 | Sonnet | 00-fundacao/front-shell.md | CONCLUIDO |
| F7  | seguranca-harness | Suíte `security/`, helpers `SET ROLE`, redaction, cobertura RLS no CI | F0, F4 | Opus | seguranca/harness.md | CONCLUIDO (revisao Opus ok; 105 testes, gate no CI) |

## Onda 1: Núcleo do pedido (loop ponta a ponta, fluxo hardcoded, sem LLM)

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| API-conta | conta | Conta + membros + papéis (convite/aceite) | F4 | Sonnet | backend-api/conta.md | CONCLUIDO |
| API-lojas | lojas | Perfil da loja, branding, horários, área | F4 | Sonnet | backend-api/lojas.md | CONCLUIDO |
| API-numeros | numeros_whatsapp | Cadastro do número (Embedded Signup), token cifrado | F4 | Opus | backend-api/numeros_whatsapp.md | CONCLUIDO |
| API-cardapio | cardapio | Grupos de opções, categorias, itens (herança + exceção) | F4 | Sonnet | backend-api/cardapio.md | CONCLUIDO |
| API-clientes | clientes | Clientes por loja (hash+cifra), endereços | F4 | Sonnet | backend-api/clientes.md | CONCLUIDO |
| API-conversas | conversas | Conversas e mensagens, janela 24h, handoff | F4, F5 | Sonnet | backend-api/conversas.md | CONCLUIDO |
| API-pedidos | pedidos | Pedidos (kanban), itens com snapshot, impressão | F4, API-cardapio, API-clientes | Sonnet | backend-api/pedidos.md | CONCLUIDO |
| ZAP-meta | shared/meta_client | Implementação `ClienteWhats` (Meta Cloud API, multi-WABA) | F2 | Opus | backend-zap/meta_client.md | CONCLUIDO (transporte endurecido vivo no envio e no webhook) |
| ZAP-webhook | webhook_whatsapp | Inbound -> enfileira; recibos; idempotência `wamid` | F4, API-conversas, API-clientes, ZAP-meta | Opus | backend-zap/webhook_whatsapp.md | CONCLUIDO |
| ZAP-enviar | enviar | Drena outbox `envios` -> Meta, claim SKIP LOCKED | ZAP-meta | Sonnet | backend-zap/enviar.md | CONCLUIDO |
| AT-motor-min | motor_fluxo (hardcoded) | Grafo fixo do pedido por botões/regras, sem LLM | API-pedidos, API-cardapio, API-conversas, ZAP-enviar | Opus | backend-atendente/motor_fluxo.md | CONCLUIDO (revisao Opus: 1 critico + achados corrigidos e reverificados) |
| FR-nucleo | telas do núcleo | Lojas, números, cardápio, pedidos (kanban), clientes, conversas | F6 + cada API-* da tela; **mock HTML + autoverificação visual** | Sonnet | frontend/nucleo.md | CONCLUIDO (6 telas no git; kanban com arrastar+Mover bidirecional) |

> **Onda 1, camada 1 integrada e no git (2026-10-27).** 7 modulos construidos em paralelo (cada um no
> seu banco de teste), integrados com commits atomicos: matriz de seguranca (0013 convites), kernel
> unico de cifra (@whaviso/shared/cifra), redaction (SEC-024), fiacao do registry, transporte Meta.
> **Gate completo verde:** api 247 testes, zap 47, shared 140, atendente 5, seguranca 111; lint,
> typecheck, check:contracts limpos. **Revisao independente (Opus, autor != revisor): APROVADA**, sem
> achado CRITICO/ALTO. Follow-ups rastreados (nao bloqueiam):
> - [MEDIO, -> ZAP-enviar] o transporte Meta vivo ainda e o cliente legado (fetch cru, sem SSRF). Fiar
>   `criarClienteWhatsMeta` (fetchSeguro/SSRF, multi-numero, credencial por chamada) no boot do zap e
>   remover o legado (graph.ts/criarClienteMeta). **Requisito #1 do ZAP-enviar.**
> - [BAIXO] `numeros.numero_hash` usa sha256 puro (hoje dado morto, nunca lido). Quando virar
>   load-bearing, usar hash CHAVEADO agnostico de pais (nao `hashTelefone`, que forca BR).
> - Promover os contratos Zod dos modulos para `packages/shared/contracts` + `gen:contracts` quando o
>   `FR-nucleo` (camada 4) for construido.
> - Push das migrations novas (0013+) no Supabase cloud ao deployar (perguntar antes, regra da casa).
> - `0014_cardapio_vinculos_ativo` opcional (cardapio funciona com neutralizacao por flag).
> - `.env.test` local com senha de superuser desatualizada: so afeta rodar testes da raiz de backend/
>   (usar `npm test` que roda por workspace); o CI usa o env do workflow e esta ok.
>
> **Onda 1, camada 2 integrada (2026-10-27):** API-pedidos, ZAP-enviar (dreno + transporte endurecido
> vivo), ZAP-webhook (inbound + legado aposentado). Gate completo verde. **Revisao independente da
> camada 2: APROVADA**; 2 MEDIO corrigidos na hora (teto de poison message; claim pula numero pausado)
> + 1 BAIXO (guarda da janela pelo tipo do payload). Follow-ups rastreados: promover o resolvedor do
> cardapio e a maquina de estados ao kernel e eliminar as copias em `pedidos` (BAIXO 2); a coluna de
> claim do inbound (`0015_mensagens_processamento`) sera criada pelo `AT-motor-min` para o atendente
> reivindicar mensagens com SKIP LOCKED.
>
> **Onda 1 BACKEND COMPLETO (2026-10-27):** AT-motor-min (motor determinístico do pedido) integrado,
> migration `0015` criada e na matriz. Revisao independente achou 1 CRITICO (mensagem-veneno que
> travaria a fila global) + 1 ALTO + 3 MEDIO; TODOS corrigidos e reverificados (anti-poison com
> savepoint por turno; coleta de grupos min/max/dependente/opcional; frete do endereco novo; gate de
> area). O laco do pedido anda ponta a ponta no backend: inbound -> motor -> pedido no kanban -> outbox
> -> envio. Limitacoes documentadas do motor-min (nao-bloqueantes): sem 2o pedido na mesma conversa sem
> handoff; `sugerivel` a nivel de item (cross-sell) adiado; gate de area so bloqueia bairro conhecido.
> **Onda 1 COMPLETA (2026-10-27):** FR-nucleo integrado e no git. 5 telas (cardapio, clientes,
> conversas, lojas, numeros) construidas em fan-out paralelo + o kanban de pedidos (tela de referencia,
> com arrastar entre colunas no desktop e botao Mover bidirecional no mobile/a11y). Rotas ligadas; front
> typecheck+lint verdes. Gap aberto: handoff assumir/devolver na tela de conversas espera o modulo
> **API-handoff** (ainda nao existe) para ligar o botao.
>
> **Onda 2 (gestao do restaurante) BACKEND COMPLETO (2026-10-27):** 7 modulos construidos em fan-out
> paralelo (ate 13 subagentes simultaneos) e integrados um a um com commit atomico: API-estoque-itens
> (0023), API-disponibilidade (0024), API-pessoas (0025, renomeado de funcionarios: "pessoas" porque
> motoboy/churrasqueiro trabalham pro restaurante sem ser CLT), API-estoque-insumos (0026),
> API-ficha-tecnica (0027), API-caixa/PDV (0028), API-salao (0029). Gate verde ponta a ponta: typecheck
> + lint + 648 testes (api 418, atendente 25, zap 65, shared 140) + 175 de seguranca (matriz: 156 casos).
> Revisao de integracao achou 7 falhas (1 bug real de meia-noite na disponibilidade, 1 de listagem, e 5
> fragilidades de teste/status), TODAS corrigidas e reverificadas. Contratos regenerados para o front.
> Regras de negocio em `historias/regras-negocio/`. PENDENTE do cloud: `supabase db push` das 0023-0029
> (perguntar antes, acao de producao).
>
> **Proximas frentes:** FR das telas da Onda 2 (pessoas, estoque, disponibilidade, caixa/PDV, salao);
> API-handoff; promover a baixa de estoque/insumo para dentro do laco de venda; Onda 2 IA (atendente:
> human-in-the-loop, trava de escopo, anti prompt-injection, ver historias/regras-negocio e memoria).

## Onda 2: IA no atendimento

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| API-config-llm | configuracoes_llm | Área BYO key (write-only), set/rotate, validação | F4, F6 | Opus | backend-api/configuracoes_llm.md | CONCLUIDO |
| AT-llm | shared/llm_client | `ClienteLLM` (OpenRouter), resolve credencial da loja, no-train | F2, API-config-llm | Opus | backend-atendente/llm_client.md | CONCLUIDO |
| AT-entender | entender_mensagem | STT (áudio) + intenção do cliente | AT-llm, AT-motor-min | Sonnet | backend-atendente/entender_mensagem.md | CONCLUIDO |
| AT-rag | rag + base_conhecimento | Retrieval efetivo escopado por loja (ver RAG.md) | AT-llm, docs/pivot/RAG.md | Opus | backend-atendente/rag.md | CONCLUIDO |
| AT-realimentar | retroalimentar_base | LLM gera/curadoria de novos documentos, aprovação do dono | AT-rag | Opus | backend-atendente/retroalimentar_base.md | CONCLUIDO |
| API-cardapio-imp | cardapio_importacao | Importar cardápio por foto/PDF via LLM | AT-llm, API-cardapio | Sonnet | backend-api/cardapio_importacao.md | CONCLUIDO |
| API-conhecimento | conhecimento | Curadoria/aprovação/versionamento da base (RAG.md) | AT-rag | Opus | backend-api/conhecimento.md | CONCLUIDO |
| AT-importar | importar_cardapio | Consumidor no atendente que roda o LLM da importação | AT-llm, API-cardapio-imp | Sonnet | backend-atendente/importar_cardapio.md | CONCLUIDO |
| AT-tools | tools (registry) | ToolContract + tools do atendente (ler/rascunho/sinal, autorização na tool) | F1, AT-llm, API-cardapio, API-pedidos, API-clientes, AT-rag | Opus | backend-atendente/tools.md | CONCLUIDO |
| AT-harness | harness (agent loop) | Laço de agente, context engineering, prompts, teto de passos/gasto, observabilidade | AT-tools, AT-motor-min, AT-entender | Opus | backend-atendente/harness.md | CONCLUIDO |

## Onda 3: Operação de entrega

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| API-zonas | zonas_entrega | Área/bairro -> taxa do cliente e valor do motoboy | F4, F6 | Sonnet | backend-api/zonas_entrega.md | A FAZER |
| API-motoboys | motoboys + fechamento | Cadastro completo, acerto do dia (auto + manual) | F4, F6 | Sonnet | backend-api/motoboys.md | A FAZER |
| API-pagamentos | pagamentos | Pix na conversa (BR Code/txid) | F4, API-conversas, API-pedidos | Opus | backend-api/pagamentos.md | A FAZER |
| API-despacho | despacho (básico) | Atribuir motoboy ao pedido, montar corrida manual | API-pedidos, API-motoboys, API-zonas | Sonnet | backend-api/despacho.md | A FAZER |
| FR-entrega | telas de entrega | Zonas, motoboys, fechamento, despacho manual | F6 + API-* da área; **mock HTML + autoverificação visual** | Sonnet | frontend/entrega.md | A FAZER |

## Onda 4: Negócio da loja e da plataforma

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| API-dashboard | dashboard (loja) | Read-model de métricas da loja | API-pedidos, API-conversas | Sonnet | backend-api/dashboard.md | A FAZER |
| API-handoff | conversas (handoff) | Atendente humano assume a conversa | API-conversas, F5 | Sonnet | backend-api/handoff.md | A FAZER |
| P-clientes | plataforma_clientes | Restaurantes como clientes (operador) | F4, F3 (operador) | Sonnet | plataforma/clientes.md | A FAZER |
| P-cobranca | plataforma_cobranca | Assinatura/faturas restaurante -> Whaviso | F4, F3 | Opus | plataforma/cobranca.md | A FAZER |
| P-funil | plataforma_funil | CRM de aquisição (prospectos, atividades) | F4, F3 | Sonnet | plataforma/funil.md | A FAZER |
| P-painel | plataforma_painel | Crescimento da base (MRR, churn, lojas ativas) | P-cobranca, P-clientes | Sonnet | plataforma/painel.md | A FAZER |
| FR-negocio | telas de negócio | Dashboard da loja + console da plataforma | F6 + API/P-*; **mock HTML + autoverificação visual** | Sonnet | frontend/negocio.md | A FAZER |

## Onda 5: Roteirização e builder

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| API-roteiriza | despacho (roteirização) | Agrupar pedidos por preparo + proximidade, `ClienteMapas` | API-despacho, F2 (ClienteMapas) | Opus | backend-api/roteirizacao.md | A FAZER |
| API-fluxo | fluxo (builder) | Editor visual do grafo (NodeContract reservado) | AT-motor-min, F1 | Opus | backend-api/fluxo.md | A FAZER |
| FR-avancado | telas avançadas | Mapa de despacho + editor de fluxo | F6 + API-*; **mock HTML + autoverificação visual** | Sonnet | frontend/avancado.md | A FAZER |

## Transversal: Segurança (acompanha cada superfície)

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| SEC-cat | catálogo de testes | Implementar os `SEC-###` do SEGURANCA.md por categoria | F7 + o módulo que cobre | Opus (revisão) | seguranca/catalogo.md | A FAZER |

---

## Notas de coordenação

- **Front sempre com mock HTML primeiro (sem Artifact):** nenhuma tarefa `FR-*` começa pelo código;
  começa por um mock `.html` standalone em `docs/pivot/mocks/<tela>/`, autoverificado por screenshot
  real no Chrome headless (desktop 1280 + mobile 390), que vira o espelho do código. Nada de ferramenta
  de Artifact (abre pop-up para o dono). Ver [README.md](README.md).
- **RAG e fine-tuning:** o design mora em `docs/pivot/RAG.md` (em produção por um especialista). `AT-rag`
  e `AT-realimentar` só começam quando ele estiver escrito.
- **Segurança é revisão Opus:** todo módulo que toca segredo (numeros, config-llm, pagamentos, rag,
  plataforma) passa por revisão Opus contra o SEGURANCA.md antes de `CONCLUIDO`.
- **Cada módulo detalhado** tem suas etapas no arquivo apontado na coluna "arquivo". Os arquivos são
  escritos a partir de [TEMPLATE-modulo.md](TEMPLATE-modulo.md).

---

## Integração: decisões consolidadas (pós-detalhamento)

Vários autores do plano levantaram pontos que cruzam módulos. Esta é a resolução canônica; onde um
arquivo de módulo divergir, vale o que está aqui.

### Credencial de LLM: escada de resolução

Ordem na hora da chamada: **credencial da loja** (`credenciais_llm`, se ativa) -> senão **chave da
plataforma** (env do servidor `OPEN_ROUTER`, em `secrets/production.env`, testada e válida). Nunca
expõe a da plataforma nem cruza lojas. Implementado em `AT-llm` e respeitado por `API-cardapio-imp` /
`AT-importar`. **Embedding e rerank usam sempre a credencial da plataforma** (ver `RAG.md`). O
`uso_llm` ganha `origem` (plataforma x loja) e `tipo_uso` (geracao/embedding/rerank).

### Reserva de numeração de migrations (a partir de 0013; evita colisão)

Vários planos propuseram "0013/0014" para coisas diferentes. Numeração canônica. Quem escrever a
migration usa o número reservado; se precisar de uma não listada, pega o próximo livre e atualiza aqui.

| Nº | Migration | Módulo dono |
|---|---|---|
| 0013 | convites | API-conta |
| 0014 | cardapio_vinculos_ativo (ativo em categoria_grupos/item_grupos) | API-cardapio |
| 0015 | mensagens_processamento (claim do inbound) | ZAP-webhook / AT-motor-min |
| 0016 | notify_triggers (SSE, se o F5 não fizer inline) | F5 |
| 0017 | importacoes_cardapio (fila + rascunho) | API-cardapio-imp |
| 0018 | rag (documentos, chunks, base_avaliacao, rag_feedback, uso_llm.tipo_uso/origem) | API-conhecimento / AT-rag |
| 0019 | pix_atendente (SELECT por coluna em loja_pix) | API-pagamentos |
| 0020 | cobranca_suspensao (lojas.suspensa por trigger) | P-cobranca |
| 0021 | despacho_config_geocode (despacho_config + dono de geocode) | API-roteiriza |
| 0022 | fluxos (fluxos/versoes) | API-fluxo |
| 0023 | itens_quantidade_disponivel (contador por item + decremento na venda) | API-cardapio (+) / API-pedidos |
| 0024 | lojas_disponibilidade (feriados/excecoes + janela do atendente LLM) | API-lojas (+) |
| 0025 | pessoas (pessoas, cargos, escalas; motoboy cargo fixo) | API-pessoas |
| 0026 | estoque_insumos (insumos, unidades, minimos, movimentos) | API-estoque-insumos |
| 0027 | ficha_tecnica (receita item -> insumos; baixa na venda) | API-ficha-tecnica |
| 0052 | documentos_rascunho_atendente (trava SEC-032: atendente so insere documentos status='rascunho') | AT-realimentar |
| 0053 | lojas_pausa_capacidade (pausada/pausada_motivo/pausada_ate + capacidade por janela) | API-lojas (+) |
| 0054 | conversas_aguardando (status_conversa += 'aguardando' para o handoff humano) | API-handoff (conversas) |
| 0055 | baixa_estoque_na_efetivacao (trigger DEFERRED: baixa item+insumo ao efetivar o pedido) | API-pedidos (+) |
| 0056 | pedidos_forma_pagamento_troco (forma_pagamento + troco_para_centavos no pedido) | API-pedidos (+) |

### Donos de escrita a combinar (um dono por coluna/tabela)

- `enderecos.lat/lng/geocodificado_em`: dono = `API-roteiriza`; `API-clientes` é dono das demais
  colunas de `enderecos`.
- `conversas.status` (handoff): dono = `API-handoff` (sub-fatia de `conversas`); `AT-motor-min` relê a
  cada turno.
- `lojas.suspensa` (de `P-cobranca`, por trigger a partir da assinatura) é diferente de `lojas.ativo`
  (do dono da loja). **`ZAP-webhook` e `AT-motor-min` devem respeitar `suspensa`** (somar essa etapa
  nesses dois módulos).

### Segurança (muda o catálogo, exige revisão Opus)

- **SEC-032 muda:** o atendente passa a ter SELECT por coluna em `loja_pix` (gerar BR Code na conversa)
  além da `chave_cifrada` já prevista. Revisão Opus + atualização do `SEGURANCA.md` antes do merge das
  migrations 0018/0019.
- **Novos testes de RAG** (no catálogo): `RAG-ISO-001` (isolamento de retrieval entre lojas, gate),
  `RAG-EVAL-001` (hit@k sobre a semente, gate), `RAG-EVAL-002` (faithfulness amostrado, monitoramento).

### Limpeza de legado coordenada

Resta código de cobrança em `apps/zap/src/shared/meta_client`, `modules/webhook_whatsapp`, `contracts`,
módulos de api/front, `shared/sync` e `shared/pix`. Regra: **adaptar o genérico, não reescrever**; a
remoção do resto é um commit coordenado à parte, nunca no meio de uma onda.

### Harness do atendente (de `../docs/pivot/HARNESS-ATENDENTE.md`)

- **Fronteira sagrada:** o motor determinístico **efetiva** (pedido, cobrança, Pix, status, gates); o
  harness só **entende e propõe** via tool (saída do modelo é dado, nunca comando, SEC-061).
- **Autorização mora na tool:** `loja_id`/`cliente_id` vêm de um `ConversaCtx` selado pelo servidor,
  nunca são argumento de tool nem o modelo os vê (fecha confused deputy).
- `F1` (kernel) ganha `ToolContract` + schemas `EventoProposto`/`RespostaProposta`. `AT-motor-min`
  invoca o harness no node de entendimento; `AT-entender` é a porta de entrada; `AT-rag` expõe
  `buscar_conhecimento` como `ToolContract`.

### Features da revisão de produto (de `../docs/pivot/REVISAO-PRODUTO.md`; tudo em escopo)

| Módulo | O que | Onda | Obs |
|---|---|---|---|
| API-crm | CRM do restaurante sobre o consumidor final: histórico por cliente, RFM, o que compra | 3 | maior diferencial; dep API-pedidos/clientes |
| API-campanhas | disparo de campanha por WhatsApp (opt-out, template, janela 24h) pela outbox | 4 | dep API-crm, ZAP-enviar |
| FR-crm | telas de CRM + campanhas (mock HTML primeiro) | 3 | dep F6, API-crm |
| API-onboarding | onboarding guiado, métrica tempo-até-1º-pedido | 1 | 1ª classe |
| API-zonas (+) | pedido mínimo e frete grátis por zona | 3 | amplia o módulo |
| API-pedidos/AT (+) | troco, forma de pagamento carimbada, repetir pedido inteiro | 1 | erro operacional real |
| API-lojas (+) | pausar a loja no pico; capacidade por janela | 1 | `lojas.pausada` |
| API-avaliacoes | avaliação/pós-venda do consumidor | 4 | tabela `avaliacoes` |
| API-estoque | baixa automática por pedido (produto; ficha técnica por ingrediente como fatia seguinte) | 5 | em escopo |
| API-canais | integração iFood/outros atrás de `ClienteCanal` (unificar pedidos) | 5 | origem `ifood` já no schema |
| API-fiscal | emissão NFC-e/NFS-e via `ClienteFiscal` (emissor de terceiro, não motor por UF) | 5 | dono = qual provedor |
| API-promocoes | cupons, combos e promoções (camada de preço promocional) | 4 | retenção/conversão |
| API-fidelidade | fidelidade/cashback do consumidor final | 5 | retenção |
| API-agendamento | pedido agendado (data/hora futura) | 3 | amplia pedidos |
| FR-kds + ClienteImpressora | tela de cozinha (KDS) e impressão ESC-POS da comanda | 3 | hardware atrás de interface |
| API-relatorios | BI/relatórios de fundo além do dashboard | 4 | read-model |
| API-custos | custos externos (LLM/WhatsApp/mapas/fiscal): livro-razão `eventos_custo` + telas loja e operador | 4 | read-model; **os dois planos veem**; ingestão em zap/atendente/clientes |

### Resiliência ("não cair durante um atendimento") -> categoria de teste RES-###

- Contrato de resiliência (timeout + circuit breaker) nos `ClienteLLM`/`ClienteWhats`/`ClienteMapas`;
  degradação graciosa (motor por botões sem LLM).
- Observabilidade com **alerta de queda** (hoje só `healthz` + alerta de custo); ver
  [[whaviso-resiliencia-systemd]]. O alerta de custo evolui para **gasto diário por loja** sobre o
  `eventos_custo` (módulo `API-custos`), cobrindo LLM + WhatsApp + mapas + fiscal, não só LLM.
- O webhook persiste o inbound **antes** do 200 à Meta (era gap do produto antigo).
- Testes de **carga** do caminho de pedido + **caos** + **idempotência sob crash**. Nova categoria
  `RES-###` no catálogo do SEGURANCA.md.

### Decisões do dono (default INCLUIR; não é corte de escopo)

Com o reenquadramento "não é MVP", tudo entra; o que resta pro dono é escopo de negócio, não cortar:
- **Fiscal (NFC-e/NFS-e):** entra via `API-fiscal` + `ClienteFiscal` integrando **emissor de terceiro**
  (não reconstruímos motor fiscal por UF, para não virar ERP). Decisão: **qual provedor**.
- **Estoque:** `API-estoque` por produto com baixa automática entra; **incluir também ficha técnica por
  ingrediente** (default incluir, fatia seguinte).
- **Billing da plataforma:** modelar **franquia + excedente** por mensagem (novo preço da Meta,
  out/2026), em vez da assinatura fixa que expõe a margem (revisar `P-cobranca`). Apoia-se no
  `eventos_custo` (`API-custos`): o excedente sai do custo real medido, não de estimativa.
- **Compliance Meta (jan/2026):** o número é atendimento/vendas da loja, **nunca** chatbot de IA
  genérico. Requisito, não opção.

### Lacunas da pesquisa de dominio (2026-10-27)

Pesquisa de mercado (iFood, Saipos, Anota AI, Goomer, Colibri, Food Sistemas) em
[../docs/pivot/PESQUISA-funcionalidades-restaurante.md](../docs/pivot/PESQUISA-funcionalidades-restaurante.md).
Veredito: o plano já cobre a maior parte do mercado; as features que eram só "linha de tabela" (CRM,
campanhas, avaliacoes, promocoes, fidelidade, KDS, canais, agendamento, relatorios) continuam onde
estao e ganham arquivo de modulo ao chegar a sua onda. O que faltava de verdade (o schema baseline nao
contempla) e abaixo.

| Lacuna nova | Prioridade | Modulo | Onda | Nota |
|---|---|---|---|---|
| Quantidade numerica por item do cardapio ("15 marmitas", baixa na venda) | imprescindivel | coluna `itens.quantidade_disponivel` (null = ilimitado) + decremento em API-pedidos | 1 | migration 0023; distinto de insumo |
| Funcionarios + Cargos (motoboy cargo fixo de sistema) + Escala (dias/turnos/diaria, sem folha) | importante | API-funcionarios (cargos, escalas) | 3 | migration 0025; some o cadastro isolado de motoboy |
| Estoque de insumos (materia-prima) primeira classe + ficha tecnica que baixa insumo na venda (base do CMV) | importante | API-estoque-insumos + API-ficha-tecnica | 5 | migrations 0026/0027; separa do estoque por item; amplia o "API-estoque" |
| Calendario de feriados/excecoes por loja + janela do atendente LLM | importante | amplia API-lojas (dado) + enforcement em AT-motor/API-pedidos | 1 (dado) / 2 (enforce) | migration 0024; horarios semanais ja estao em API-lojas |

Decisoes tomadas (default, sem travar o dono):
- **Motoboy = funcionario de cargo fixo "motoboy"** (cadastro unico): o cargo habilita os campos de
  entrega (veiculo, placa, Pix) e o fechamento do dia. `API-motoboys` passa a ler `funcionarios`.
- **Dois estoques distintos:** quantidade por item do cardapio (contador direto, onda 1) e estoque de
  insumo (baixado por ficha tecnica, onda 5). Complementares, nao excludentes.
- **Escala** registra turnos e diaria e soma por periodo, cruzando com o fechamento do motoboy; sem folha.
- **Posicionamento CONFIRMADO pelo dono (2026-10-27):** NAO e so delivery. O uso real e o dono no
  restaurante com o sistema aberto atendendo presencialmente E o agente de WhatsApp rodando em paralelo,
  tudo num sistema so. Entao **PDV/caixa e salao (mesas/comandas) ENTRAM como modulos**, com testes e no
  padrao do projeto, nao ficam como futuro/opcional.

| PDV / caixa (abrir/fechar, sangria, suprimento, formas de pagamento, fechamento de turno; sem fiscal) | importante | API-caixa + FR-caixa | 4 | migration 0028 |
| Salao: mesas e comandas (abrir mesa/comanda, lancar itens, fechar/dividir conta, app do garcom) | importante | API-salao + FR-salao | 4 | migration 0029 |

Fora de escopo confirmado: folha de pagamento/RH; nota fiscal/fiscal (so via `ClienteFiscal` de
terceiro). PDV de hardware pesado nao; PDV/caixa como software, sim.

### Segurança desta leva (vai pro catálogo)

- Harness: `SEC-063` (tool não aceita `loja_id`/`cliente_id` como argumento), `SEC-064` (id opaco
  revalidado contra a loja), `SEC-065` (injeção em tool-use), `SEC-066` (idempotência de ação),
  `SEC-067` (teto de passos/gasto degrada para botões).
- Campanhas: `SEC-11x` (campanha não cruza loja, exige opt-out, só dentro de template/janela).
- Custos: isolamento de `eventos_custo` (loja só lê o próprio `loja_id`; operador lê agregado/métrica,
  **nunca conteúdo**; nenhuma coluna de conteúdo na tabela). Entra no catálogo do SEGURANCA.md.
- Resiliência: categoria `RES-###`.

### Migrations desta leva (reserva 0023+)

campanhas, campanha_envios, cliente_consentimento, view `clientes_metricas` (RFM),
`pedidos.forma_pagamento`/`troco_para`, `zonas.pedido_minimo`/`frete_gratis`, `lojas.pausada`,
`avaliacoes`, `eventos_custo` + `tarifas_meta` (catálogo de tarifa Meta por país x categoria),
anonimização LGPD. Numeração sequencial a partir de 0023, atualizando a tabela de reserva.
