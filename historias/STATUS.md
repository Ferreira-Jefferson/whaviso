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

## Onda 0: Fundação (quase tudo depende daqui)

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| F0  | db-baseline | Schema multi-tenant, roles, RLS, grants por coluna | — | — | 00-fundacao/db-baseline.md | CONCLUIDO |
| F1  | kernel-contratos | Zod fonte única + NodeContract + eventos + codegen `gen_contracts` | F0 | Sonnet | 00-fundacao/kernel-contratos.md | A FAZER |
| F2  | clientes-externos | Interfaces `ClienteWhats`/`ClienteLLM`/`ClienteMapas` (contratos + stubs) | F1 | Sonnet | 00-fundacao/clientes-externos.md | A FAZER |
| F3  | tenant-auth | JWT/JWKS local, escopo de loja (membros) e de operador | F0, F1 | Opus | 00-fundacao/tenant-auth.md | A FAZER |
| F4  | api-core | server/app/routes registry, http_errors, config, logger, fronteira `shared/db` | F0, F1, F3 | Sonnet | 00-fundacao/api-core.md | A FAZER |
| F5  | realtime-sse | SSE na api sobre `LISTEN/NOTIFY` do Postgres | F4 | Sonnet | 00-fundacao/realtime-sse.md | A FAZER |
| F6  | front-shell | SPA shell, api_client, auth (login), `_generated`, ui kit, tenant/branding, realtime client | F1, F4 | Sonnet | 00-fundacao/front-shell.md | A FAZER |
| F7  | seguranca-harness | Suíte `security/`, helpers `SET ROLE`, redaction, cobertura RLS no CI | F0, F4 | Opus | seguranca/harness.md | A FAZER |

## Onda 1: Núcleo do pedido (loop ponta a ponta, fluxo hardcoded, sem LLM)

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| API-conta | conta | Conta + membros + papéis (convite/aceite) | F4 | Sonnet | backend-api/conta.md | A FAZER |
| API-lojas | lojas | Perfil da loja, branding, horários, área | F4 | Sonnet | backend-api/lojas.md | A FAZER |
| API-numeros | numeros_whatsapp | Cadastro do número (Embedded Signup), token cifrado | F4 | Opus | backend-api/numeros_whatsapp.md | A FAZER |
| API-cardapio | cardapio | Grupos de opções, categorias, itens (herança + exceção) | F4 | Sonnet | backend-api/cardapio.md | A FAZER |
| API-clientes | clientes | Clientes por loja (hash+cifra), endereços | F4 | Sonnet | backend-api/clientes.md | A FAZER |
| API-conversas | conversas | Conversas e mensagens, janela 24h, handoff | F4, F5 | Sonnet | backend-api/conversas.md | A FAZER |
| API-pedidos | pedidos | Pedidos (kanban), itens com snapshot, impressão | F4, API-cardapio, API-clientes | Sonnet | backend-api/pedidos.md | A FAZER |
| ZAP-meta | shared/meta_client | Implementação `ClienteWhats` (Meta Cloud API, multi-WABA) | F2 | Opus | backend-zap/meta_client.md | A FAZER |
| ZAP-webhook | webhook_whatsapp | Inbound -> enfileira; recibos; idempotência `wamid` | F4, API-conversas, API-clientes, ZAP-meta | Opus | backend-zap/webhook_whatsapp.md | A FAZER |
| ZAP-enviar | enviar | Drena outbox `envios` -> Meta, claim SKIP LOCKED | ZAP-meta | Sonnet | backend-zap/enviar.md | A FAZER |
| AT-motor-min | motor_fluxo (hardcoded) | Grafo fixo do pedido por botões/regras, sem LLM | API-pedidos, API-cardapio, API-conversas, ZAP-enviar | Opus | backend-atendente/motor_fluxo.md | A FAZER |
| FR-nucleo | telas do núcleo | Lojas, números, cardápio, pedidos (kanban), clientes, conversas | F6 + cada API-* da tela; **artifact primeiro** | Sonnet | frontend/nucleo.md | A FAZER |

## Onda 2: IA no atendimento

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| API-config-llm | configuracoes_llm | Área BYO key (write-only), set/rotate, validação | F4, F6 | Opus | backend-api/configuracoes_llm.md | A FAZER |
| AT-llm | shared/llm_client | `ClienteLLM` (OpenRouter), resolve credencial da loja, no-train | F2, API-config-llm | Opus | backend-atendente/llm_client.md | A FAZER |
| AT-entender | entender_mensagem | STT (áudio) + intenção do cliente | AT-llm, AT-motor-min | Sonnet | backend-atendente/entender_mensagem.md | A FAZER |
| AT-rag | rag + base_conhecimento | Retrieval efetivo escopado por loja (ver RAG.md) | AT-llm, docs/pivot/RAG.md | Opus | backend-atendente/rag.md | A FAZER |
| AT-realimentar | retroalimentar_base | LLM gera/curadoria de novos documentos, aprovação do dono | AT-rag | Opus | backend-atendente/retroalimentar_base.md | A FAZER |
| API-cardapio-imp | cardapio_importacao | Importar cardápio por foto/PDF via LLM | AT-llm, API-cardapio | Sonnet | backend-api/cardapio_importacao.md | A FAZER |
| API-conhecimento | conhecimento | Curadoria/aprovação/versionamento da base (RAG.md) | AT-rag | Opus | backend-api/conhecimento.md | A FAZER |
| AT-importar | importar_cardapio | Consumidor no atendente que roda o LLM da importação | AT-llm, API-cardapio-imp | Sonnet | backend-atendente/importar_cardapio.md | A FAZER |
| AT-tools | tools (registry) | ToolContract + tools do atendente (ler/rascunho/sinal, autorização na tool) | F1, AT-llm, API-cardapio, API-pedidos, API-clientes, AT-rag | Opus | backend-atendente/tools.md | A FAZER |
| AT-harness | harness (agent loop) | Laço de agente, context engineering, prompts, teto de passos/gasto, observabilidade | AT-tools, AT-motor-min, AT-entender | Opus | backend-atendente/harness.md | A FAZER |

## Onda 3: Operação de entrega

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| API-zonas | zonas_entrega | Área/bairro -> taxa do cliente e valor do motoboy | F4, F6 | Sonnet | backend-api/zonas_entrega.md | A FAZER |
| API-motoboys | motoboys + fechamento | Cadastro completo, acerto do dia (auto + manual) | F4, F6 | Sonnet | backend-api/motoboys.md | A FAZER |
| API-pagamentos | pagamentos | Pix na conversa (BR Code/txid) | F4, API-conversas, API-pedidos | Opus | backend-api/pagamentos.md | A FAZER |
| API-despacho | despacho (básico) | Atribuir motoboy ao pedido, montar corrida manual | API-pedidos, API-motoboys, API-zonas | Sonnet | backend-api/despacho.md | A FAZER |
| FR-entrega | telas de entrega | Zonas, motoboys, fechamento, despacho manual | F6 + API-* da área; **artifact primeiro** | Sonnet | frontend/entrega.md | A FAZER |

## Onda 4: Negócio da loja e da plataforma

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| API-dashboard | dashboard (loja) | Read-model de métricas da loja | API-pedidos, API-conversas | Sonnet | backend-api/dashboard.md | A FAZER |
| API-handoff | conversas (handoff) | Atendente humano assume a conversa | API-conversas, F5 | Sonnet | backend-api/handoff.md | A FAZER |
| P-clientes | plataforma_clientes | Restaurantes como clientes (operador) | F4, F3 (operador) | Sonnet | plataforma/clientes.md | A FAZER |
| P-cobranca | plataforma_cobranca | Assinatura/faturas restaurante -> Whaviso | F4, F3 | Opus | plataforma/cobranca.md | A FAZER |
| P-funil | plataforma_funil | CRM de aquisição (prospectos, atividades) | F4, F3 | Sonnet | plataforma/funil.md | A FAZER |
| P-painel | plataforma_painel | Crescimento da base (MRR, churn, lojas ativas) | P-cobranca, P-clientes | Sonnet | plataforma/painel.md | A FAZER |
| FR-negocio | telas de negócio | Dashboard da loja + console da plataforma | F6 + API/P-*; **artifact primeiro** | Sonnet | frontend/negocio.md | A FAZER |

## Onda 5: Roteirização e builder

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| API-roteiriza | despacho (roteirização) | Agrupar pedidos por preparo + proximidade, `ClienteMapas` | API-despacho, F2 (ClienteMapas) | Opus | backend-api/roteirizacao.md | A FAZER |
| API-fluxo | fluxo (builder) | Editor visual do grafo (NodeContract reservado) | AT-motor-min, F1 | Opus | backend-api/fluxo.md | A FAZER |
| FR-avancado | telas avançadas | Mapa de despacho + editor de fluxo | F6 + API-*; **artifact primeiro** | Sonnet | frontend/avancado.md | A FAZER |

## Transversal: Segurança (acompanha cada superfície)

| ID | Módulo | Objetivo | Depende de | Modelo | Arquivo | Status |
|---|---|---|---|---|---|---|
| SEC-cat | catálogo de testes | Implementar os `SEC-###` do SEGURANCA.md por categoria | F7 + o módulo que cobre | Opus (revisão) | seguranca/catalogo.md | A FAZER |

---

## Notas de coordenação

- **Front sempre com artifact primeiro:** nenhuma tarefa `FR-*` começa pelo código; começa por um
  artifact visual (desktop + mobile), que vira o espelho do código. Ver [README.md](README.md).
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
| FR-crm | telas de CRM + campanhas (artifact primeiro) | 3 | dep F6, API-crm |
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

### Resiliência ("não cair durante um atendimento") -> categoria de teste RES-###

- Contrato de resiliência (timeout + circuit breaker) nos `ClienteLLM`/`ClienteWhats`/`ClienteMapas`;
  degradação graciosa (motor por botões sem LLM).
- Observabilidade com **alerta de queda** (hoje só `healthz` + alerta de custo); ver
  [[whaviso-resiliencia-systemd]].
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
  out/2026), em vez da assinatura fixa que expõe a margem (revisar `P-cobranca`).
- **Compliance Meta (jan/2026):** o número é atendimento/vendas da loja, **nunca** chatbot de IA
  genérico. Requisito, não opção.

### Segurança desta leva (vai pro catálogo)

- Harness: `SEC-063` (tool não aceita `loja_id`/`cliente_id` como argumento), `SEC-064` (id opaco
  revalidado contra a loja), `SEC-065` (injeção em tool-use), `SEC-066` (idempotência de ação),
  `SEC-067` (teto de passos/gasto degrada para botões).
- Campanhas: `SEC-11x` (campanha não cruza loja, exige opt-out, só dentro de template/janela).
- Resiliência: categoria `RES-###`.

### Migrations desta leva (reserva 0023+)

campanhas, campanha_envios, cliente_consentimento, view `clientes_metricas` (RFM),
`pedidos.forma_pagamento`/`troco_para`, `zonas.pedido_minimo`/`frete_gratis`, `lojas.pausada`,
`avaliacoes`, anonimização LGPD. Numeração sequencial a partir de 0023, atualizando a tabela de reserva.
