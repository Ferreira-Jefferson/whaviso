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

## Dois planos: a plataforma opera, a loja usa

O produto tem **duas audiências**, e o esqueleto anterior só enxergava uma. É uma distinção de
kernel, não detalhe de tela:

- **Plano da loja (o restaurante usa):** cardápio, pedidos, conversas, clientes, entrega. Tudo
  escopado por `loja_id`, acessado por quem é **membro** da loja (dono/gerente/atendente).
- **Plano da plataforma (a Whaviso opera):** o restaurante **é o cliente** da Whaviso. Aqui vive o
  console do operador: ver as contas/lojas cadastradas, a **cobrança restaurante -> Whaviso**
  (assinatura mensal, faturas, inadimplência, suspensão), o **funil de aquisição** (prospecto ->
  ativo, follow-ups) e o **painel de crescimento** da base (MRR, churn, lojas ativas). É acessado
  só pela **equipe Whaviso** (tabela `operadores`, papel de operador), nunca por um membro de loja.

As duas são features feature-first no mesmo `api`, separadas por **escopo de auth**, não por
projeto: o kernel resolve ou um `loja_id` (membro) ou um escopo de operador (equipe). O painel de
plataforma e o dashboard da loja são **read-models** (leem muitos domínios por leitura cruzada
read-only, nunca pelo interno de outro módulo). Nenhum dado de conteúdo de cliente final vaza para
o operador: o operador vê **métricas e faturamento das lojas**, não as conversas nem os pedidos
delas.

## Entrega: zona, despacho e roteirização

A operação de entrega tem três camadas distintas, hoje achatadas num só `rotas`:

- **Zona de entrega (`zonas_entrega`):** configuração estável, bairro/polígono -> taxa cobrada do
  cliente + valor pago ao motoboy. É o que precifica a entrega no pedido.
- **Motoboy + fechamento:** cadastro completo do entregador (veículo, placa, Pix, ativo), atribuição
  do motoboy **no pedido** (nome fica registrado para responsabilização de qualquer ocorrência), e o
  **fechamento do dia**: soma automática do que cada motoboy tem a receber (derivada das entregas),
  com **lançamento manual** por cima para quando o restaurante não destina um motoboy fixo por
  entrega. Fecha o dia marcável como pago.
- **Despacho / roteirização (`despacho` + `corridas`):** a camada complexa e de maior valor. Agrupa
  pedidos que devem **sair juntos** por tempo de preparo + proximidade geográfica, sugere a `corrida`
  (um lote: 1 motoboy, N pedidos, ordem de parada) e deixa o operador aceitar ou ajustar à mão. Exige
  **geocodificação** dos endereços (`lat/lng` em `enderecos`) e matriz de distância/tempo.

O provedor de mapas fica **isolado atrás de uma interface `ClienteMapas`** (geocode + matriz +
rota), do mesmo jeito que o WhatsApp vive atrás de `ClienteWhats`. Começa com opção **gratuita**
(Nominatim para geocode, OSRM/OpenRouteService para matriz e rota) e deixa o Google Maps como
implementação alternativa plugável, sem espalhar a escolha pelo código. A roteirização é a última
onda: o cadastro de motoboy, a atribuição no pedido e o fechamento (as camadas que já resolvem o
grosso da dor) vêm antes e não dependem de mapas.

## A API é a única porta; o banco é trocável

Princípio não-negociável, pensado desde o schema: **o front nunca fala com o banco.** A SPA só
consome REST + SSE da `api`; o `supabase-js` no front serve **apenas** para o login (JWT). Nenhuma
query, nenhuma tabela, nenhum RLS-como-regra-de-negócio no cliente. Isso já é verdade hoje (RLS
deny-all para anon/authenticated) e vira requisito de design do rebuild, não acaso.

O ganho real que você quer é **portabilidade do banco**: sair do Supabase, trocar de host ou de
Postgres gerenciado deve ser mudança **pontual**, não reescrita. Para isso:

- **Uma única fronteira de dados:** todo acesso passa por `packages/shared/db` (pool `pg`, SQL
  padrão). Os módulos chamam essa fronteira, nunca um cliente Supabase nem PostgREST. Trocar o host
  do Postgres = trocar a connection string num lugar.
- **Nada específico de Supabase no caminho de dados:** sem Edge Functions, sem PostgREST, sem
  Realtime do Supabase (o nosso realtime é SSE sobre `LISTEN/NOTIFY`, padrão Postgres). O que usamos
  do Supabase é Postgres (portável) + Auth (JWT validado localmente por JWKS, que qualquer emissor
  OIDC pode substituir).
- **Contratos na borda da api, não o shape do banco:** o front recebe os DTOs do contrato (Zod
  gerado), nunca linhas cruas. Mudar uma coluna não vaza para o cliente; mudar de banco não muda o
  contrato.
- **Portável por padrão:** SQL ANSI sempre que der, `pgcrypto`/`vector` são as únicas extensões e
  ambas existem em qualquer Postgres; migrations em SQL puro (não no CLI proprietário). Supabase é
  **detalhe de infra**, não dependência de arquitetura.

Resultado: a `api` é o produto durável; o banco por baixo é substituível. É o mesmo movimento do
`ClienteWhats` e do `ClienteMapas` (provedor atrás de interface), aplicado à persistência.

## LLM por loja: provedor modular e a chave do próprio cliente

A IA aparece em vários pontos (importar cardápio por foto/PDF, entender áudio e texto do cliente,
montar pedido, resumos e gestões pro dono). **Nada disso pode estar escrito direto no código.** Dois
movimentos:

- **Provedor atrás de `ClienteLLM`** (mesma família de `ClienteWhats`/`ClienteMapas`): a escolha de
  provedor (OpenRouter recomendado, Anthropic, ou outro), modelo e parâmetros é **configuração**, não
  código de módulo. Cada ponto que usa IA consome a interface; trocar provedor ou modelo é mudança
  pontual. Vive em `atendente/shared/llm_client`.
- **Chave do próprio cliente (BYO key):** cada loja configura a **própria** credencial (provedor +
  chave + modelo preferido) numa área do painel. Módulo `configuracoes_llm` na api + tela no front. Em
  runtime, o `atendente` resolve a credencial **daquela loja**, decifra na hora da chamada e chama o
  provedor com a chave dela.
- **Escada de resolução (padrão da plataforma -> override da loja):** no onboarding, e sempre que a
  loja ainda não tiver chave própria, o sistema usa a **chave da plataforma** (a chave OpenRouter do
  dono do SaaS), para a importação de cardápio e o atendimento já funcionarem antes de a loja ter a
  dela. Quando a loja cadastra a própria, a resolução passa a usar **só a dela** e para de tocar na da
  plataforma. A chave da plataforma vive **só no servidor** (secret/env, `OPEN_ROUTER`), **nunca no
  banco por loja e nunca no front**: nenhuma loja a enxerga, nem vê a chave de outra loja. O
  provedor inicial é OpenRouter, mas tudo isso é atrás do `ClienteLLM`, aberto a outros provedores. O
  `uso_llm` marca a origem (plataforma x loja) para medir o custo que corre por nossa conta. Nota de
  RAG: embedding e rerank usam sempre a credencial da **plataforma**, nunca a BYO da loja (a dimensão
  do vetor é propriedade do índice; ver [RAG.md](RAG.md)).

**Esta é a informação mais perigosa do sistema:** uma chave vazada vira custo imediato pro cliente e
pra nós. O tratamento é de nível máximo e está especificado em [SEGURANCA.md](SEGURANCA.md); em resumo:

- **Cifrada em repouso com envelope encryption**, a master key **fora do banco** (env/secret manager):
  um dump do banco sozinho não revela chave nenhuma.
- **Texto claro nunca volta pro cliente:** o campo é write-only; a tela mostra só provedor, últimos 4
  dígitos e "configurada". Nenhum endpoint devolve a chave.
- **Privilégio mínimo por coluna:** a `api` escreve (set/rotate) e lê só os metadados; **só o worker
  `atendente` lê o texto cifrado** para decifrar no momento do uso. A chave nunca entra em log (a
  redaction cobre o campo) nem no prompt enviado ao provedor.
- **Consumo contabilizado** (`uso_llm`) com alerta de gasto anômalo, para pegar abuso/vazamento cedo.

## Segurança como disciplina, não etapa final

Com chave de LLM, token da Meta, Pix e PII de clientes finais no mesmo banco multi-tenant, segurança é
requisito de arquitetura. O projeto ganha um documento vivo, [SEGURANCA.md](SEGURANCA.md), que é ao
mesmo tempo **modelo de ameaças** (o que proteger, de quem, por quais vetores) e **catálogo de testes
automatizados** (cada ameaça vira um teste com id, verde ou vermelho no CI). Uma suíte `security/`
roda no gate, a cobertura de RLS continua obrigatória, e **subagents especializados** fazem o papel de
red team periódico contra o catálogo. Toda feature nova atualiza o catálogo antes de entrar.

## O harness do atendente e a resiliência

O agente que responde no WhatsApp é um **harness de LLM hand-rolled** (não framework) sobre o
`ClienteLLM`, detalhado em [HARNESS-ATENDENTE.md](HARNESS-ATENDENTE.md). A regra é a **fronteira
sagrada**: o motor de fluxo determinístico **efetiva** (confirma pedido, total, Pix, status, com os
gates de segurança); o harness só **entende e propõe** via tools. A saída do modelo é sempre dado,
nunca comando. As tools ficam num registry atrás de `ToolContract` (família do `NodeContract`), cada
uma impondo escopo de loja e privilégio mínimo: a autorização mora na tool, com `loja_id`/`cliente_id`
num contexto selado pelo servidor que o modelo nunca vê. Novo em `atendente/`: `shared/harness`,
`shared/prompts` (base + guardrails em arquivo versionado, persona por loja em tabela) e `tools/<nome>`.

**Resiliência (não cair durante um atendimento):** todo `Cliente*` (LLM, Whats, Mapas, e os provedores atrás de
interface `ClienteCanal` (iFood e outros canais), `ClienteFiscal` (nota via terceiro) e
`ClienteImpressora` (ESC-POS/KDS)) tem **timeout + circuit breaker**, e a falha degrada para o
fluxo por botões, nunca erro cru. O estado da conversa é durável no Postgres (um crash retoma), o
webhook persiste o inbound **antes** de responder 200 à Meta, e tudo é idempotente. Falta montar a
observabilidade com **alerta de queda** e os testes de **carga, caos e idempotência sob crash**
(categoria `RES-###` no [SEGURANCA.md](SEGURANCA.md)).

**Compliance de canal:** a Meta permite atendimento e vendas, mas **proíbe chatbot de IA genérico** no
WhatsApp (desde jan/2026) e passou a cobrar por mensagem (out/2026). O produto se apresenta como o
atendimento da loja (templates aprovados, persona de atendimento), nunca como bot genérico; o custo por
mensagem entra no modelo de billing da plataforma (franquia + excedente).

## Observabilidade de custos externos (os dois planos veem)

Todo gasto externo (LLM, mensagem WhatsApp, mapas, fiscal) vira linha num livro-razão único
(`eventos_custo`), não só o LLM. O mesmo dado, duas leituras: o **console da plataforma** vê o custo de
toda a base, por loja, e cruza com o que cada loja paga (margem, custo por conversa, gasto diário); o
**dashboard da loja** vê só o seu, separando o que ela paga direto (chave BYO) do que corre por nossa
conta e conta contra a franquia. A atribuição da mensagem WhatsApp depende de **quem iniciou** a
conversa (loja x cliente) e da categoria (marketing/utility/authentication/service): o `zap` lê isso do
`pricing` no webhook de status da Meta e converte pela tarifa (catálogo em migration). O custo de LLM
vem do provedor (o OpenRouter devolve o custo da geração) e é guardado em micros (o sub-centavo importa).
O operador vê **métrica, nunca conteúdo** (mantém a regra dos dois planos). O livro-razão alimenta o
alerta de gasto anômalo e o billing franquia + excedente. Schema no [BANCO.md](BANCO.md); módulo
`API-custos` e as telas em [../../historias/STATUS.md](../../historias/STATUS.md).

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
        shared/   auth, tokens, http_errors, realtime (SSE), tenant (escopo loja + papéis),
                  operador (escopo plataforma), mapas_client (geocode + matriz; OSRM/ORS, Google opcional)
        modules/
          (loja)        conta, lojas, numeros_whatsapp, cardapio, cardapio_importacao,
                        pedidos, conversas, clientes, zonas_entrega, motoboys, despacho,
                        pagamentos, dashboard_loja, fluxo, perfil, configuracoes_llm (BYO key)
          (plataforma)  plataforma_clientes (restaurantes), plataforma_cobranca (restaurante->Whaviso),
                        plataforma_funil (CRM de aquisição), plataforma_painel (crescimento/MRR)
    zap/        transporte WhatsApp (:3002), fino
      src/
        shared/meta_client/  multi-WABA (credencial por loja, roteia inbound por phone_number_id)
        modules/  webhook_whatsapp (inbound -> enfileira; recibos -> envios),
                  enviar (drena outbox -> Meta), sincronizar_templates
    atendente/  worker de conversa (async, centro de custo de IA)
      src/
        shared/   llm_client (ClienteLLM: provedor plugável OpenRouter/Anthropic, credencial por loja,
                  reserva + no-train), rag, stt, media_storage
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
    modules/  painel da loja: lojas, numeros, cardapio, pedidos (kanban), conversas,
              clientes, zonas_entrega, motoboys, despacho (mapa), dashboard, fluxo,
              configuracoes_llm (chave do cliente, write-only)
              console da plataforma (equipe Whaviso): plataforma/clientes, cobranca, funil, painel
```

**Orquestrador, dashboard da loja e painel da plataforma** (as features que leem muitos domínios):
são **read-models**, leem por leitura cruzada read-only via `shared/db` documentada no MODULE.md (já
permitido no AGENTS.md atual), nunca importam o interno de outra feature; escrita é só do módulo dono
da tabela; coordenação de escrita cross-feature por outbox/evento. Dados sempre-ao-vivo (preço,
disponibilidade, status) vêm do sistema, nunca do cache. O **painel da plataforma** agrega por conta
(lojas ativas, MRR, inadimplência, funil), nunca o conteúdo das lojas; o **despacho** é read-model
sobre pedidos + endereços geocodificados + zonas, e só escreve na própria `corridas`.

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
3. **Operação de entrega:** `zonas_entrega` + `motoboys` (cadastro completo) + atribuição no pedido +
   fechamento do dia (automático + manual) + `pagamentos` (Pix).
4. **Negócio da loja e da plataforma:** `dashboard` da loja, `conversas` (handoff humano), multi-loja
   consolidado; **console da plataforma**: `plataforma_clientes` + `plataforma_cobranca`
   (assinatura restaurante -> Whaviso) + `plataforma_funil` + `plataforma_painel` (crescimento).
5. **Roteirização e builder:** `despacho` com `ClienteMapas` (geocode + agrupar pedidos por preparo +
   proximidade) e o `fluxo` builder visual (NodeContract reservado desde a onda 1). As duas peças
   caras e complexas, por último, sobre um núcleo já em produção.

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
