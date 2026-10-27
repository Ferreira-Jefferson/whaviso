# STATUS: quadro mestre do rebuild

Inventário de módulos, dependências e ondas. É o ponto de partida de qualquer subagent. O **status
vivo de cada tarefa** mora no arquivo do seu módulo (coluna "arquivo"); esta tabela é o **mapa de
dependências e a ordem**. Protocolo de execução: ver [README.md](README.md).

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
