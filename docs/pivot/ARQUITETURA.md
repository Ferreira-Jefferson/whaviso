# Arquitetura do rebuild (proposta para aprovação)

> **Status:** proposta, para o dono revisar e aprovar antes de encodar no CLAUDE.md/AGENTS.md.
> **Data:** 2026-10-27. Produto novo: automação de pedidos de restaurante por WhatsApp.
> **Origem:** pesquisa web sobre estruturar código para a era da IA + leitura da skill
> `feature-first`, do `backend/AGENTS.md` e da estrutura/stack atuais.

## Veredito curto

O esqueleto atual **serve bem**: o pivô é troca de domínio, não de arquitetura. Mantém
monorepo npm + feature-first com enforcement no build + outbox no Postgres + Supabase
(Postgres+Auth) + Fastify/TS/Zod/tsx. As quatro mudanças que mais pagam, em ordem:

1. **Terceiro app `apps/atendente`** (worker de conversa): isola o centro de custo de IA
   (LLM + RAG + STT), que é caro e assíncrono. O `zap` continua **fino** (só transporte:
   webhook entra, enfileira; outbox sai, envia). Integração por outbox/inbox no banco.
2. **Multi-tenant (`loja_id`) como kernel, não feature:** Conta -> Lojas -> Números. Um
   especialista comum de escopo de loja + papéis + RLS por loja, que toda feature consome,
   senão cada módulo reinventa o scoping e um esquece.
3. **Realtime por SSE** a partir da api, alimentado por `LISTEN/NOTIFY` do Postgres (sem
   Redis), no lugar do polling de 30s. Kanban de pedidos e conversas ao vivo pedem isso.
4. **Contratos do front gerados do backend, não espelhados à mão.** Hoje o front reescreve
   os Zod da api; para um codebase mantido por LLM, editar o mesmo payload em dois projetos
   é o custo cross-file que queremos matar.

O **builder de fluxo (tipo n8n)** começa **hardcoded** (um grafo de nodes em código) com um
`NodeContract` reservado no kernel; o editor visual vem depois sem refazer o motor. O próprio
spec diz que as etapas fixas (confirmação, endereço, pagamento, repetir) usam botões e regras
sem LLM.

## Insights da pesquisa (fundamentam as decisões)

Ressalva honesta: é convergência de praticantes, não benchmark controlado. O ganho é mecânico
(menos arquivos por tarefa = menos tokens e menos quebra silenciosa).

1. **"O codebase é o prompt."** Camadas (Clean/Onion/MVC) espalham uma feature por muitas
   pastas e forçam o agente a carregar arquivo irrelevante, diluindo contexto e convidando ao
   chute. Vertical slice dá localidade: carrega só o que a feature precisa. (jeremydmiller.com,
   "The Codebase Is the Prompt", 2026)
2. **O raio de quebra termina na fronteira da pasta.** Em slices, nada fora do slice depende
   do interno dele; um arquivo compartilhado editado não quebra outra feature em silêncio.
   (managed-code.com, "Vertical-slice architecture for AI-generated code")
3. **Comprimir a cerimônia do slice** importa tanto quanto isolar: menos boilerplate por slice
   = o slice inteiro cabe no contexto com folga. Codificar a fiação em AGENTS.md/MODULE.md.
4. **AGENTS.md aninhado** é o padrão de monorepo: root define defaults, cada app/pacote
   sobrescreve, o agente lê o mais próximo do arquivo. (Mintlify, buildbetter, Datadog, 2026)
5. **Contraponto real:** camadas vencem quando muitas features compartilham regra complexa. A
   saída feature-first é **read-model + kernel enxuto**, não camada de domínio gorda. Este
   produto tem duas zonas assim: o motor de conversa (lê cardápio+clientes+rotas+pedidos+RAG) e
   o dashboard (agrega tudo). (Milan Jovanović, "When to Choose Vertical Slice over Layered")
6. **Contratos front/back:** fonte única mata o drift; o custo é acoplar os ciclos. Zod resolve
   (valida em runtime). tRPC elimina a questão mas acopla o front ao router (rejeitado aqui,
   que mantém o front independente). (Leapcell; devforge "One Schema, Zero Drift")

## Estrutura recomendada

Três runtimes, um banco, outbox + SSE. AGENTS.md no root + um por app.

```
backend/
  apps/
    api/        REST para o painel SPA (:3001)
      src/
        server.ts · app.ts · routes.ts   (registry: 1 linha por módulo)
        shared/   auth, tokens, http_errors, realtime (SSE), tenant (escopo loja + papéis)
        modules/  conta, lojas, numeros_whatsapp, cardapio, cardapio_importacao,
                  pedidos, conversas, clientes, rotas, motoboys, pagamentos,
                  dashboard, fluxo, billing, perfil, admin
    zap/        transporte WhatsApp (:3002), fino
      src/
        shared/meta_client/  multi-WABA (credencial por loja, roteia inbound por phone_number_id)
        modules/  webhook_whatsapp (inbound -> enfileira; recibos -> envios),
                  enviar (drena outbox -> Meta), sincronizar_templates
    atendente/  worker de conversa (async, centro de custo de IA)
      src/
        shared/   llm_client (OpenRouter + reserva + no-train), rag, stt, media_storage
        nodes/<tipo>/  plugins do grafo (saudacao, pedir_categoria, montar_pedido,
                       confirmar, endereco, pix, acompanhar) atrás de NodeContract, num registry
        modules/  motor_fluxo, entender_mensagem (STT+intenção), retroalimentar_base (RAG)
  packages/shared/   kernel cross-app: contracts (fonte única Zod + NodeContract + eventos),
                     db, logger, config, datas. Zero regra de negócio.
  supabase/   baseline novo: migrations + seed, loja_id em tudo, RLS por loja
  scripts/    scaffold_module.sh, gen_contracts (codegen front), validate_migrations.sh
frontend/     SPA React/Vite standalone (:5173)
  src/
    shared/   ui, api_client, auth, realtime (SSE), format, tenant (seletor de loja + branding)
    shared/contracts/_generated/   GERADO do backend, commitado, não editar à mão
    modules/  espelham o painel: lojas, numeros, cardapio, pedidos (kanban), conversas,
              clientes, rotas, motoboys, dashboard, fluxo, billing, admin
```

**Orquestrador e dashboard** (as features que leem muitos domínios): são **read-models**, leem
por leitura cruzada read-only via `shared/db` documentada no MODULE.md (já permitido no AGENTS.md
atual), nunca importam o interno de outra feature; escrita é só do módulo dono da tabela;
coordenação de escrita cross-feature por outbox/evento. Dados sempre-ao-vivo (preço,
disponibilidade, status) vêm do sistema, nunca do cache.

**Contratos front/back (decisão-chave):** fonte única em `@whaviso/shared/contracts`; um script
`gen_contracts` emite `frontend/src/shared/contracts/_generated/` (commitado). O front **não**
importa `@whaviso/shared` (preserva a independência de deploy), importa só o gerado local. Em
runtime nada acopla; em dev, uma edição no contrato + regenerar substitui a edição dupla. Hook de
CI falha se o gerado estiver fora de sincronia. Mata o drift sem adotar tRPC.

**Nodes do fluxo = registry de plugins:** cada node é um slice minúsculo implementando
`NodeContract` (do kernel), co-locado e registrado num registry. Não viola "módulo não importa
módulo" (consomem contrato, não um ao outro). Adicionar um passo = adição local.

## Ordem de construção (em ondas, não tudo de uma vez)

1. **Núcleo do pedido:** `lojas` + `numeros_whatsapp` + `cardapio` + `pedidos` (kanban) +
   `clientes` + motor de conversa mínimo com **fluxo hardcoded** (sem builder, sem LLM nas
   etapas fixas). Entrega o loop ponta a ponta.
2. **IA no atendimento:** `entender_mensagem` (STT + intenção), `rag` + cache, `cardapio_importacao`.
3. **Operação:** `rotas` + `motoboys` + fechamento do dia + `pagamentos` (Pix).
4. **Visão e negócio:** `dashboard`, `billing`, `conversas` (handoff humano), multi-loja consolidado.
5. **Depois:** `fluxo` builder visual (contrato já reservado desde o passo 1).

## Proposta de melhoria da skill feature-first (rascunho; a skill é global, não sobrescrita)

Sete adições para produtos com orquestração + IA + multi-runtime + multi-tenant + plugins:
1. **Orquestrador também é feature:** lê por read-model/contrato, nunca pelo interno. Resposta
   ao contraponto "camadas vencem com regra compartilhada": read-model + kernel enxuto.
2. **Plugins de mesma forma atrás de um contrato:** registry, não God module. Deixar explícito
   que não é "módulo importa módulo".
3. **Feature pode atravessar runtimes:** mantém um nome só (api + worker + transporte), conversam
   por outbox/contrato; mapa no AGENTS.md root.
4. **Contrato entre projetos independentes: gere, não espelhe** (codegen commitado + CI de sync),
   preferível a tRPC quando a independência é requisito.
5. **Multi-tenant é kernel:** especialista de escopo de tenant + RLS, no checklist do kernel.
6. **Comprimir a cerimônia do slice** (handler por convenção, 1 linha no registry, transação por
   helper) além do limite de linhas; AGENTS.md/MODULE.md como "constituição".
7. **AGENTS.md aninhado em monorepo:** root + um por app que sobrescreve; terseness é feature.
