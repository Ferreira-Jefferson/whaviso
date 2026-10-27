# Revisão de produto do whaviso: necessidade real x plano atual

> **Status:** análise para o dono decidir. Confronta o plano do rebuild (`docs/pivot/` +
> `historias/`) com o objetivo final, a necessidade real do restaurante e a do consumidor final,
> e com o que os concorrentes do mercado brasileiro fazem em 2026.
> **Data:** 2026-10-27. Produto: automação de pedidos de restaurante por WhatsApp, multi-tenant.
> **Método:** leitura de ARQUITETURA, BANCO, SEGURANCA, RAG, QA-REVISAO e dos arquivos de módulo em
> `historias/**`, mais pesquisa de concorrentes (fontes ao final; muito é material de fornecedor, e
> está sinalizado).

## 1. Objetivo final e posicionamento

O whaviso é o atendente de IA que vende pelo WhatsApp **do próprio restaurante** (sem a comissão e
sem a posse do cliente que o marketplace cobra), acoplado a uma gestão de operação de verdade: kanban
de pedidos, cadastro de cardápio normalizado, entrega com motoboy e roteirização, pagamento Pix na
conversa, e um console onde a Whaviso cobra os restaurantes como clientes. O diferencial **defensável**
não é "ter um bot no WhatsApp" (isso virou commodity e o maior concorrente, Anota AI, é do iFood): é a
combinação de três coisas que raramente vivem juntas e bem feitas: (a) o atendimento por IA no canal
próprio, com **chave de LLM da própria loja (BYO key)** e uma base de conhecimento que **se realimenta
da conversa** com curadoria do dono, o que nenhum concorrente de prateleira oferece; (b) a **operação
de entrega própria** (zonas, acerto de motoboy, agrupamento e roteirização de corridas), a dor que o
delivery fora do marketplace sente mais e que quase ninguém resolve bem; e (c) a **relação com o
consumidor final como ativo do restaurante** (CRM, histórico, recompra), que o iFood sequestra. O risco
de posicionamento, honesto: isso só é defensável se as três pernas forem profissionais. Se o whaviso
for só "mais um bot + cardápio", perde para o Anota AI (distribuição do iFood) e para o Saipos (ERP
completo). A aposta certa é ser o **sistema de canal próprio + retenção**, não um ERP fiscal.

## 2. Mapa de necessidades x cobertura

Legenda: **COBERTO** (há módulo/plano concreto), **PARCIAL** (há base, falta a feature que o dono
sente), **FALTANDO** (não existe no plano). A coluna "onde" cita o módulo ou doc.

### 2.1 Restaurante (o cliente)

| Necessidade real | Status | Onde / observação |
|---|---|---|
| Atender e fechar pedido no WhatsApp sem digitar tudo à mão | COBERTO | `AT-motor-min` (fluxo hardcoded) + `AT-entender` (STT/intenção, Onda 2) |
| Cardápio com tamanhos, adicionais, combos de opção, esgotado | COBERTO | `API-cardapio` (grupos reutilizáveis, herança+exceção, `esgotado_ate`) |
| Importar cardápio por foto/PDF sem redigitar | COBERTO | `API-cardapio-imp` + `AT-importar` (Onda 2) |
| Ver e tocar os pedidos (kanban, imprimir comanda) | COBERTO | `API-pedidos` (kanban, snapshot, impressão HTML/térmica) |
| Receber Pix na conversa | PARCIAL | `API-pagamentos`: Pix copia-e-cola estático, **conciliação manual** (sem PSP/webhook) |
| Entrega própria: taxa por bairro, acerto do motoboy | COBERTO | `API-zonas` + `API-motoboys` (fechamento auto + manual) |
| Agrupar pedidos e roteirizar corridas | COBERTO | `API-despacho` + `API-roteiriza` (Onda 5, `ClienteMapas`) |
| Multi-loja e vários números de WhatsApp | COBERTO | `contas->lojas->numeros`, `numeros_whatsapp` multi-WABA |
| Dashboard de operação (faturamento, ticket, pico, ranking) | COBERTO | `API-dashboard` + `FR-negocio` |
| **CRM do consumidor final: quem compra o quê, recompra, campanha** | **FALTANDO** | só `API-clientes` (cadastro) + agregado simples na ficha; ver gap G1 |
| **Controle de estoque / ingrediente / baixa automática** | **FALTANDO** | só liga/desliga manual de item; ver gap G2 |
| **Fiscal: NFC-e, SAT, XML pro contador** | **FALTANDO** | ausente; ver gap G3 (decisão do dono) |
| **Unificar pedidos do iFood e outros canais num painel só** | PARCIAL | `pedidos.origem` tem `ifood`, mas **não há integração** que puxe o pedido; ver gap G4 |
| **Promoção, cupom, combo com desconto, frete grátis, pedido mínimo** | FALTANDO | nenhuma regra de preço promocional; ver gap G5 |
| **Fidelidade / cashback / pontos** | FALTANDO | ausente; ver gap G6 |
| Pausar a loja no pico / capacidade por janela | PARCIAL | há horário e `esgotado`, mas não "pausar agora" nem limite de pedidos/janela; gap G7 |
| Agendar pedido para depois | FALTANDO | fluxo assume pedido imediato; gap G8 |
| Pagamento: dinheiro com troco, cartão na entrega | PARCIAL | formas existem no node `pagamento`; **troco não é calculado/registrado**; gap G9 |
| Impressão na cozinha / KDS | PARCIAL | gera comanda HTML/térmica; sem envio direto ESC/POS nem tela de cozinha; gap G10 |
| Onboarding rápido (subir e vender no mesmo dia) | PARCIAL | há `conta`+`lojas`+import de cardápio, mas sem fluxo guiado nem tempo-para-primeiro-pedido; gap G11 |
| Relatórios/BI mais fundo (DRE, fechamento de caixa, por canal) | PARCIAL | dashboard cobre o essencial; falta caixa/por-canal; gap G12 (backlog) |

### 2.2 Consumidor final (o cliente do cliente)

| Necessidade real | Status | Onde / observação |
|---|---|---|
| Pedir rápido no WhatsApp, por botão, sem app novo | COBERTO | `AT-motor-min` (lista/botão) |
| Repetir o último pedido / último endereço | PARCIAL | último **endereço** sim (`API-clientes`); "repetir o pedido inteiro" não está no fluxo; gap G13 |
| Saber o preço e a disponibilidade corretos (não defasados) | COBERTO | regra de ouro do `RAG.md`: preço/estoque sempre por consulta viva, nunca embeddado |
| Acompanhar "cadê meu pedido" | COBERTO | node `acompanhar` lê status ao vivo |
| Saber o tempo de entrega estimado | PARCIAL | status existe; **ETA calculada** (preparo+rota) não está especificada; gap G14 |
| Ser reconhecido (nome, histórico) ao voltar | PARCIAL | cliente é reconhecido por telefone; o atendente não usa histórico para sugerir; liga ao gap G1 |
| Pagar fácil (Pix, dinheiro com troco, cartão) | PARCIAL | ver G9 |
| Avaliar o pedido / reclamar de um problema | FALTANDO | sem coleta de avaliação nem canal de pós-venda; gap G15 |
| Receber oferta/retorno relevante (sem spam) | FALTANDO | depende do CRM/campanha (G1), respeitando janela 24h e template |
| Ter os dados tratados conforme a LGPD | PARCIAL | telefone em hash+cifra, log sem PII; **falta apagar/anonimizar e consentimento de marketing**; gap G16 |

### 2.3 Whaviso (a operadora do SaaS)

| Necessidade real | Status | Onde / observação |
|---|---|---|
| Cadastrar restaurantes como clientes | COBERTO | `P-clientes` |
| Cobrar assinatura, emitir fatura, suspender inadimplente | COBERTO | `P-cobranca` (assinatura ~R$700/mês, faturas, suspensão por trigger) |
| Funil de aquisição de restaurantes | COBERTO | `P-funil` (prospectos, atividades) |
| Painel de crescimento (MRR, churn, lojas ativas) | COBERTO | `P-painel` (métricas puras testadas) |
| Não ver conteúdo de loja (só métrica/faturamento) | COBERTO | separação de escopo operador x membro (SEC-003) |
| Medir e conter o custo de LLM que corre por conta da plataforma | COBERTO | `uso_llm` (origem plataforma x loja) + alerta SEC-100 |
| Cobrar do restaurante **pelo uso real** (margem sobre LLM/WhatsApp) | PARCIAL | assinatura fixa; não há repasse por consumo de mensagem/LLM; gap G17 (decisão do dono) |
| Absorver a nova cobrança por mensagem do WhatsApp (out/2026) | FALTANDO | mudança de preço da Meta não está modelada no billing; gap G17 |
| Emitir a própria NF de serviço da assinatura | FALTANDO | billing da plataforma não emite NF; gap G18 (decisão do dono) |

## 3. Gaps priorizados

Recomendação por gap: **MVP** (antes de vender), **Onda** (próximas ondas planejadas), **Backlog**
(depois, quando houver tração). "Decisão do dono" marca escopo de negócio, não de engenharia.

### G1. CRM do restaurante sobre o consumidor final (campanha, recompra, segmentação) — MVP (parcial) + Onda

Este é o **diferencial mais vendável e hoje o maior buraco**. O plano tem o dado (clientes + pedidos)
mas só `API-clientes` (cadastro, endereços, agregado cru de contagem/soma/último pedido na ficha) e o
`API-dashboard` (métrica agregada). Não existe: histórico de compra por cliente (itens favoritos,
frequência, recência, ticket), segmentação (novo, recorrente, inativo, VIP), nem **envio de campanha**
(retorno/recompra via WhatsApp respeitando janela de 24h e template aprovado). Isso não é penduricalho:
é o que transforma o whaviso de "ferramenta de pedido" em "ferramenta de **faturamento**", e é
exatamente onde o restaurante que fugiu do iFood mais sofre (perdeu o CRM que o iFood tinha). Ele
compete de frente com o **Saipos CRM** (módulos de fidelidade e de marketing para cliente ocioso, com
cupom automático e envio no horário de consumo) e com o movimento do **iFood/CRMBonus** (cashback). O
whaviso tem uma vantagem estrutural: a conversa já passa por ele, então a campanha sai do mesmo número,
com o mesmo histórico, sem integração externa.

**Delta concreto (ver seção 5):** um módulo novo de API `crm` (ou `clientes_crm`) que leia pedidos por
cliente e compute segmento/RFM por read-model, mais um módulo `campanhas` que monte públicos
(segmentos), dispare envio em lote pelo outbox `envios` **só por template aprovado** e **respeitando a
janela de 24h e o opt-out**, com uma tela `FR` de base de clientes + funil de retenção. O risco a travar
por construção: campanha é o vetor perfeito de virar spam e queimar o número na Meta; precisa de limite
de frequência, consentimento (G16) e uso exclusivo de template fora da janela. Parte do MVP: a **ficha
de cliente com histórico e os segmentos** (barato, só leitura). Onda seguinte: o **disparo de campanha**
(exige template, opt-out, rate limit).

### G2. Estoque / inventário — Onda futura (decisão do dono sobre profundidade)

Hoje só existe o liga/desliga manual e o "esgotado hoje" (`esgotado_ate`). Falta baixa automática por
pedido e, mais fundo, estoque por **ingrediente** com ficha técnica (vender o X-Burger baixa pão, carne,
queijo; quando a carne acaba, 86 automático em tudo que a usa). O Anota AI e o Saipos têm isso nos
planos superiores. Recomendação: **MVP cobre com o manual que já existe** (dá para operar); o estoque
por produto com baixa automática é Onda futura; o estoque por ingrediente com ficha técnica é **decisão
do dono** sobre entrar nessa briga de ERP ou não. Minha opinião: entrar com estoque **por produto**
(simples, alto valor percebido, evita vender o que acabou) e **ficar fora** de ficha técnica por
ingrediente na v1 (complexidade de ERP que dilui o foco em canal próprio + retenção).

### G3. Fiscal (NFC-e / SAT / XML) — Decisão do dono; recomendação: não no MVP

Ausente por completo. É o divisor entre "assistente de vendas" e "ERP fiscal". Fiscal é caro (certificado,
SEFAZ por estado, homologação), muda por UF, e é um poço de manutenção. O Saipos vende justamente isso.
**Recomendação forte: ficar fora do MVP e provavelmente do produto**, e integrar com um emissor fiscal
de terceiro (ou com o PDV que a loja já usa) quando a demanda aparecer. Vender canal próprio + retenção
sem fiscal é um posicionamento legítimo; virar meio-ERP fiscal é mudar de produto. Marcar como **decisão
do dono** explícita.

### G4. Integração iFood e outros canais (unificar pedidos) — Onda futura

`pedidos.origem` já prevê `ifood`/`manual`/`whatsapp`, mas não há módulo que **puxe** o pedido do iFood
para o kanban. Para um restaurante que não vai abandonar o iFood da noite pro dia, "tudo num painel só"
é um gancho de adoção forte (e o próprio Anota/Saipos integram iFood, Rappi, 99, Keeta). Recomendação:
**Onda futura**, atrás de uma interface `ClienteCanal` (como `ClienteWhats`), começando por iFood
(webhook/polling da API de parceiro). Não é MVP, mas é o caminho natural de crescimento e reduz o atrito
de "mas eu já tenho iFood".

### G5. Promoções, cupons, combos com desconto, pedido mínimo, frete grátis — Onda (MVP mínimo)

O cardápio tem preço fixo por item+opções; não há camada de **preço promocional**: cupom, combo com
desconto, "frete grátis acima de X", pedido mínimo por zona. Pedido mínimo e frete grátis são quase
expectativa mínima no delivery. Recomendação: **MVP inclui pedido mínimo e frete grátis por zona**
(barato, alto valor, encaixa em `zonas_entrega`/`pedidos`); cupom e combo promocional ficam para **Onda
seguinte**. É também matéria-prima das campanhas (G1): campanha sem cupom converte menos.

### G6. Fidelidade / cashback — Backlog (ou dentro do CRM)

Programa de pontos/cashback. O iFood comprou 20% da CRMBonus para isso; o Saipos tem fidelidade. É
diferencial de retenção, mas é construção grande. Recomendação: **Backlog**, e quando entrar, nascer
**dentro do módulo de CRM/campanha** (G1), não solto. Cashback simples ("acumule e ganhe") antes de
pontos complexos.

### G7. Pausar a loja no pico / capacidade por janela — Onda (MVP mínimo)

Há horário de funcionamento e `esgotado`, mas não o botão "pausar pedidos agora" (cozinha afogada) nem
limite de N pedidos por faixa de horário. "Pausar agora" é expectativa mínima e é barato. Recomendação:
**MVP** para o pausar manual (um estado em `lojas` que o `saudacao`/node de entrada respeita);
capacidade por janela é Onda futura.

### G8. Agendamento de pedido — Backlog

Pedir às 15h para entregar às 20h. Útil para pizzaria/eventos, não para a maioria no dia um.
Recomendação: **Backlog**, decisão do dono conforme o nicho-alvo.

### G9. Troco (dinheiro) e forma de pagamento completa — MVP

O node `pagamento` oferece Pix, dinheiro e cartão na entrega, mas **não pergunta/registra o troco**
("troco para quanto?") nem carimba a forma escolhida no pedido para a comanda e o motoboy. Isso gera
erro operacional real (motoboy sem troco). Recomendação: **MVP**, é pequeno e evita atrito na porta.
A conciliação de Pix é manual hoje (G sem número, aceitável na v1); PSP com webhook é backlog.

### G10. Impressão de cozinha / KDS — Onda futura

Gera comanda HTML e texto para térmica, mas sem envio direto ESC/POS (precisa de agente local) nem tela
de cozinha (KDS). Para o MVP a impressão pelo navegador resolve; **envio direto à impressora** e **KDS**
são Onda futura (KDS é diferencial em cozinha movimentada).

### G11. Onboarding rápido — Onda 1 (merece módulo próprio)

As peças existem (criar conta, loja, importar cardápio), mas não há um **fluxo guiado** nem a métrica
"tempo até o primeiro pedido". Para SaaS de restaurante, o onboarding é o maior ponto de evasão.
Recomendação: tratar o onboarding como **entrega de primeira classe na Onda 1** (checklist guiado:
conectar número, importar cardápio, configurar zona/Pix, pedido de teste), não como subproduto do
cadastro.

### G12. Relatórios/BI mais fundos (caixa, por canal, DRE simples) — Backlog

O dashboard cobre o essencial (faturamento, ticket, pico, ranking). Fechamento de caixa, faturamento por
canal e visão de margem são backlog, puxados pela demanda.

### G13-G15. Repetir pedido inteiro (MVP), ETA de entrega (Onda), avaliação pós-pedido (Onda)

- **G13 Repetir o último pedido inteiro** (não só o endereço): forte redutor de atrito de recompra,
  casa com o CRM. **MVP** no fluxo (um atalho "repetir meu último pedido").
- **G14 ETA de entrega** (preparo + rota) informada ao cliente: hoje só há status. **Onda** (depende da
  roteirização para a parte de rota; o tempo de preparo pode ser um número por loja já na Onda 1).
- **G15 Avaliação/pós-venda**: coletar nota/comentário após `entregue` e abrir canal de problema. **Onda
  futura**; alimenta o CRM e o RAG (reclamação recorrente vira conhecimento).

### G16. LGPD operável (apagar/anonimizar + consentimento de marketing) — Onda (parte MVP)

A base é boa (hash+cifra, log sem PII, sem DELETE). Falta o **direito de exclusão/anonimização** do
consumidor (hoje registrado como melhoria futura em `API-clientes`) e, crítico para G1, o
**consentimento de marketing** (opt-in/opt-out) antes de qualquer campanha. Recomendação: opt-out e a
base do consentimento entram **junto com a campanha (G1)**, não depois; a anonimização sob pedido é Onda.

### G17. Billing por consumo e a mudança de preço da Meta (out/2026) — Onda (decisão do dono)

O billing da plataforma é assinatura fixa (~R$700/mês). A partir de **1/out/2026 o WhatsApp muda para
cobrança por mensagem** (modelo de serviço), e o LLM por conversa também é custo variável. Assinatura
fixa sem teto de uso **expõe a margem da Whaviso** a quem manda muita mensagem. Recomendação: modelar
**franquia + excedente** (mensagens/conversas no plano, excedente cobrado) ou repasse do custo de
mensagem, e usar `uso_llm` (já existe) como base de medição. **Decisão do dono** sobre a política de
preço; a engenharia precisa estar pronta para medir e cobrar por uso.

### G18. NF de serviço da própria assinatura — Backlog (decisão do dono)

A Whaviso precisa emitir NFS-e das assinaturas. Não está no plano. Backlog/integração contábil externa.

## 4. Estabilidade e qualidade ("não cair durante um atendimento")

O plano é **acima da média** em disciplina de confiabilidade para um produto neste estágio, com buracos
específicos a fechar antes de chamar de "estável sob atendimento real".

**O que já está bem coberto:**
- **Durabilidade do estado da conversa:** o estado do fluxo mora em `conversas`/`mensagens` no Postgres,
  não em memória do worker; um crash no meio do atendimento **retoma** lendo o banco. O pedido nasce como
  `rascunho` e vira `novo` numa transação idempotente por conversa (`AT-motor-min`). Isso é o ponto mais
  importante e está certo.
- **Idempotência de ponta a ponta:** inbound por `wamid` com `INSERT ON CONFLICT DO NOTHING`
  (`ZAP-webhook`), claim de outbox `FOR UPDATE SKIP LOCKED` com reenvio idempotente (`ZAP-enviar`), uma
  mensagem por conversa por vez (`AT-motor-min`). Replay não duplica pedido nem resposta.
- **Retry com backoff:** `ZAP-enviar` tem backoff exponencial com jitter e teto; o SSE reconecta com
  backoff e `Last-Event-ID` (`realtime-sse`, `front-shell`); em `credencial_invalida` pausa o número em
  vez de martelar.
- **Degradação graciosa do LLM:** o motor é **button-first sem LLM**; `entender_mensagem` é um pré-passo
  opcional. Se o LLM da loja cair ou faltar, o fluxo segue por botões. Esse é o design correto de
  degradação e já está previsto.
- **Restart:** `healthz` existe; a memória `whaviso-resiliencia-systemd` tem backoff geométrico de
  restart na api/zap (pendente aplicar no VPS).
- **Segurança verificada por código:** o catálogo `SEC-###` + `RAG-ISO/EVAL` no gate do CI é um ativo
  forte e raro; isolamento multi-tenant, segredos e prompt injection viram teste, não promessa.

**O que falta para "estável sob atendimento real":**
1. **Circuit breaker + timeout explícitos no `ClienteLLM`, `ClienteWhats` e `ClienteMapas`.** O plano
   fala de retry, mas não de **timeout por chamada** nem de breaker que abre quando o provedor degrada
   (evita fila de conversas travando em chamadas lentas ao LLM/Meta). Deve ser requisito dos `Cliente*`.
2. **Degradação graciosa quando a Meta cai (saída).** O inbound é durável, mas quando a Meta está fora o
   outbox só acumula; falta política de **expiração/alerta** de mensagens que envelhecem na fila e a
   regra de não responder "tarde demais" fora da janela de 24h.
3. **Observabilidade.** Não há módulo/plano de métricas, tracing ou alerta operacional além do alerta de
   custo de LLM (SEC-100) e dos `healthz`. Para "não cair sem eu saber" faltam: métricas de fila (idade
   do outbox, inbound pendente), latência de LLM/Meta, taxa de erro por loja, e **alerta de queda**
   (adiado na memória `whaviso-resiliencia-systemd`). Isso é o que vira o "ficou mudo durante o almoço".
4. **Profundidade de teste além do unitário/integração/segurança.** Há teste de carga **leve** só no SSE
   (200 conexões). Faltam: **teste de carga** do caminho de pedido (N conversas concorrentes, drenagem do
   outbox sob pressão), **teste de caos** (derrubar LLM/Meta/banco no meio e ver o retomar), e teste de
   **idempotência sob crash** (matar o worker entre o envio e a marcação). O catálogo `SEC-###` não tem
   categoria de resiliência; vale uma (ex.: `RES-###`).
5. **Durabilidade do inbound confirmada no produto novo.** No produto antigo isso foi um gap conhecido
   (padrão inbox, `RISCOS-ACEITOS-E-DIFERIDOS` D2). O plano novo o resolve se o `ZAP-webhook` **gravar a
   mensagem antes de devolver 200 à Meta** (a Meta não reentrega após o 200). Confirmar que a ordem é
   "persiste + idempotência, depois 200", não "200, depois processa".
6. **Risco de plataforma (Meta, jan/2026).** A Meta passou a **proibir chatbots de IA de uso geral** no
   WhatsApp Business quando essa é a função principal, permitindo IA de **atendimento/vendas**. O whaviso
   está do lado permitido, mas isso é existencial: o posicionamento, os templates e o comportamento do
   atendente devem deixar claro que é atendimento de vendas de um negócio, não um assistente genérico.
   Tratar como requisito de compliance, não detalhe.

Veredito de estabilidade: **o esqueleto aguenta "não cair durante um atendimento" no caminho feliz e
nos modos de falha previstos (crash do worker, replay, LLM fora)** porque o estado é durável e
idempotente. O que falta para a promessa ser verdadeira sob pico real é **circuit breaker/timeout nos
provedores, observabilidade com alerta de queda, e testes de carga e caos**. Sem isso, a primeira
sexta-feira de pico com a Meta lenta é um risco não medido.

## 5. Deltas propostos para o plano (não editei os arquivos; listo para integrar)

### 5.1 STATUS.md (módulos e ondas novos)

- **Novo módulo `API-crm` (Onda 4, ou puxar ficha+segmento para Onda 1):** read-model sobre
  `pedidos`+`clientes` que computa, por cliente, histórico de itens, frequência, recência, ticket e
  **segmento** (novo/recorrente/inativo/VIP, RFM simples). Dono de nenhuma tabela de escrita de negócio;
  lê por read-model. Depende de `API-pedidos`, `API-clientes`.
- **Novo módulo `API-campanhas` (Onda 4):** monta públicos por segmento e dispara envio em lote pelo
  outbox `envios`, **só por template aprovado**, respeitando janela 24h, opt-out e rate limit de
  frequência. Depende de `API-crm`, `API-conversas` (contrato de envio), `numeros_whatsapp`. Revisão Opus
  (é superfície de spam e de custo de mensagem).
- **Nova tela `FR-crm` (Onda 4):** base de clientes com histórico, funil de retenção (segmentos) e
  criação de campanha. Artifact primeiro.
- **Novo módulo `API-onboarding` (Onda 1):** checklist guiado de ativação e métrica de tempo-até-primeiro-
  pedido. Orquestra conta/loja/número/cardápio/zona/Pix já existentes.
- **Ampliar `API-zonas` (Onda 3):** pedido mínimo e frete grátis por zona (campos + validação no
  `montar_pedido`/`endereco`).
- **Ampliar `AT-motor-min`/`API-pedidos`:** node de **troco** ("troco para quanto?") e carimbo da forma
  de pagamento na comanda; atalho **"repetir último pedido"**.
- **Ampliar `API-lojas`:** estado **"pausar pedidos agora"** respeitado pelo `saudacao`.
- **Módulos futuros a registrar (Onda 5+ / backlog):** `API-canais` (integração iFood atrás de
  `ClienteCanal`), `API-estoque` (por produto, baixa por pedido), `API-promocoes` (cupom/combo),
  `API-avaliacoes` (pós-pedido), `API-fidelidade` (cashback, dentro de CRM).
- **Nova categoria de teste transversal `RES-###` (resiliência):** carga do caminho de pedido, caos
  (derrubar provedor/banco), idempotência sob crash, idade/alerta de outbox.

### 5.2 ARQUITETURA.md

- **Contrato de resiliência dos `Cliente*`:** `ClienteLLM`/`ClienteWhats`/`ClienteMapas` passam a
  declarar **timeout por chamada e circuit breaker** como parte da interface (não detalhe de
  implementação), com fallback definido (LLM fora, cai para botão; mapas fora, despacho manual).
- **Seção de observabilidade:** definir o mínimo (métricas de fila/latência/erro por loja, `healthz`
  profundo, alerta de queda) como peça de arquitetura, não afterthought. Hoje o doc não a tem.
- **`ClienteCanal` (integração de marketplace):** registrar a interface pluggável para iFood e afins,
  na mesma família dos outros `Cliente*`, alimentando `pedidos.origem`.
- **Fluxo de campanha:** registrar que o disparo em massa usa o mesmo outbox `envios`, com guardas de
  template/janela/opt-out, para não abrir um segundo caminho de saída.

### 5.3 BANCO.md

- **CRM/campanha:** `clientes` ganha, por read-model, os agregados de RFM (ou uma view materializada
  `clientes_metricas` por loja, atualizada por evento, para não recomputar a cada abertura). Tabelas
  novas: `campanhas` (segmento-alvo, template, status, janela), `campanha_envios` (1 linha por
  destinatário, liga ao `envios`), `cliente_consentimento` (opt-in/opt-out de marketing, append-only).
- **Pedido/pagamento:** `pedidos` ganha `forma_pagamento` e `troco_para_centavos`; opcional
  `pedido_minimo_centavos`/`frete_gratis_acima_centavos` em `zonas_entrega`.
- **Loja:** `lojas.pausada` (estado operacional distinto de `ativo` e de `suspensa` do billing).
- **Avaliação:** `avaliacoes` (nota, comentário, por pedido) quando G15 entrar.
- **LGPD:** campo/rotina de anonimização em `clientes` (UPDATE que zera PII preservando as métricas
  agregadas sem telefone).
- **Billing por uso:** `assinaturas` ganha franquia (mensagens/conversas incluídas) e `faturas` passa a
  compor excedente a partir de `uso_llm`/contagem de `envios`, por causa da mudança de preço da Meta.
- **Reserva de migrations:** seguir a numeração reservada no STATUS.md a partir do próximo livre
  (ex.: `0023_crm_campanhas`, `0024_pedido_pagamento_extras`, `0025_loja_pausada`).

### 5.4 SEGURANCA.md

- **Campanha é superfície nova de abuso e de PII:** acrescentar ativo "lista de clientes para campanha" e
  ameaças: campanha cruzando loja (um operador/loja disparando para base de outra, extensão de SEC-001),
  campanha sem opt-out (compliance), campanha fora de template/janela (queima o número na Meta).
  Novos testes: **SEC-11x** (campanha só para clientes da loja do escopo; só template aprovado; respeita
  opt-out; rate limit de frequência).
- **Categoria de resiliência `RES-###`** no catálogo (carga, caos, idempotência sob crash, alerta de
  outbox), no mesmo mecanismo "ameaça/risco -> teste -> status".
- **Compliance de plataforma Meta (jan/2026):** registrar como requisito que o atendente é de
  atendimento/vendas de um negócio, com template e comportamento condizentes, não um chatbot genérico.

## 6. Veredito

O plano cobre um **produto profissional e diferenciado** no núcleo que escolheu (atender e vender no
WhatsApp próprio + operar a entrega), com uma disciplina de banco, segurança e modularidade acima do
normal para o estágio. O diferencial defensável existe e está nos lugares certos (BYO key, RAG que se
realimenta, operação de entrega, canal próprio sem comissão), **desde que** duas lacunas sejam tratadas
como primeira classe e não como "depois": o **CRM/retenção do consumidor final** (hoje o maior buraco e o
que mais vende, porque o concorrente Saipos já o tem e o iFood o sequestra) e a **estabilidade sob pico**
(circuit breaker, observabilidade com alerta de queda, teste de carga e caos). Fora do núcleo, a decisão
estratégica do dono é **não virar ERP fiscal** (fiscal, estoque por ingrediente): competir como sistema
de canal próprio + retenção, integrando com quem já faz fiscal, em vez de reconstruir o Saipos. Promoção,
pedido mínimo, troco, pausar-agora e onboarding guiado são gaps pequenos de alto valor que cabem no MVP;
iFood, KDS, fidelidade e agendamento são crescimento. Estável o bastante para o caminho feliz; ainda não
provado sob pico real.

## Fontes

Pesquisa de mercado (2026). Ressalva: boa parte é material de fornecedor (site do próprio), tratado como
indicativo, não como benchmark independente.

- Anota AI (bot em WhatsApp/Instagram/Facebook, PDV, estoque/KDS/NFC-e em planos superiores, mensalidade
  fixa sem comissão; adquirido pelo iFood):
  [Canaltech, cardápio digital para WhatsApp](https://canaltech.com.br/apps/como-funciona-o-cardapio-digital-para-whatsapp-guia-pratico/);
  [comparativo Take App x Anota AI](https://www.take.app/alternatives/anota-ai);
  [Baguete, iFood leva Anota AI](https://www.baguete.com.br/noticias/ifood-leva-anota-ai).
- Mudanças da Meta/WhatsApp: proibição de chatbots de IA de uso geral (15/jan/2026) e novo preço por
  mensagem de serviço (1/out/2026):
  [Tecnoblog](https://tecnoblog.net/noticias/whatsapp-proibe-presenca-do-chatgpt-e-outras-ias/);
  [Infobip, mudanças de preço do WhatsApp Business 2026](https://www.infobip.com/pt/blog/mudancas-nos-precos-do-whatsapp-business-e-como-se-preparar).
- Saipos (ERP: PDV, estoque com ficha técnica, NFC-e, CRM de fidelidade e marketing, integrações iFood/
  Rappi/99/Keeta/Anota/Goomer):
  [Saipos, como funciona](https://saipos.com/como-funciona);
  [Saipos CRM](https://saipos.com/sistema/saipos-crm);
  [Saipos NFC-e](https://saipos.com/fiscal/nf/nfce/go).
- CRM/retenção e cashback no setor (Saipos CRM para cliente ocioso; iFood e CRMBonus; recuperação por
  WhatsApp):
  [Baguete, iFood adquire 20% da CRMBonus](https://www.baguete.com.br/noticias/ifood-adquire-20-da-crmbonus);
  [Saipos, 71% de recuperação via WhatsApp](https://saipos.com/noticia/ifood-tem-71-de-recuperacao-com-atendimento-via-whatsapp).
- Logística/entrega e dinâmica competitiva (iFood adquire Pick n Go para roteirização; Envios iFood para
  canais próprios; volta da 99 Food e entrada da Keeta após o CADE restringir exclusividade do iFood):
  [Mundo Logística, iFood entregadores dedicados](https://mundologistica.com.br/noticias/ifood-modalidade-entregadores-dedicados-restaurantes);
  [BemParaná, CEO do iFood sobre entregas em 2026](https://www.bemparana.com.br/noticias/economia/ceo-do-ifood-promete-entregas-em-ate-20-minutos-em-2026/amp/).
</content>
</invoke>
