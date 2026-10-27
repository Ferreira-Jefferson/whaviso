# Revisão do QA exploratório para o pivô

> **Status:** análise para o dono revisar. Acompanha as melhorias de baixo risco já aplicadas
> nos arquivos do skill e dos agentes (seção 6).
> **Data:** 2026-10-27. Produto novo: automação de pedidos de restaurante por WhatsApp, multi-tenant.
> **Escopo:** o Chrome QA Loop vendorizado no repo (`.claude/skills/chrome-qa-loop/`,
> `.claude/agents/chrome-qa-explorer.md`, `.claude/agents/qa-report-triage.md`,
> `chrome-qa-loop.config.json`), avaliado contra `docs/pivot/ARQUITETURA.md`, `BANCO.md`,
> `SEGURANCA.md` e `historias/`.

## 1. O que o QA é hoje

Um loop de QA exploratório com humano no meio: um agente explorador (`chrome-qa-explorer`) dirige
um Chrome real pelo Chrome DevTools MCP, navega a SPA tela a tela, aplica quatro lentes (QA,
Product, Engineering, Security) e escreve um relatório markdown por achado; o humano revisa; um
agente de triagem (`qa-report-triage`) deduplica, prioriza (P0 a P3) e emite `TASKS.md` mais stubs
de `PLAN.md`. O explorador fundamenta o "esperado" de cada tela num doc dono, hoje apontado para
`historias/`. A infraestrutura (MCP já conectado, 1 relatório por achado escrito na hora, triagem
como ponte revisão para implementação) é boa e deve ser preservada.

## 2. Diagnóstico honesto

### 2.1 Quebrado por mudança de referência (bloqueia a primeira rodada)

- **O manifesto autoritativo não existe.** A config aponta `SCREEN_MANIFEST` para `docs/qa/PLAN.md`,
  o skill e o agente chamam esse arquivo de "contrato autoritativo" que vence tudo, e a pasta
  `docs/qa/` inteira não existe no repo. O loop depende de um artefato ausente. No pivô isso é
  oportuno: o manifesto do produto velho teria que ser jogado fora de qualquer forma.
- **O grounding aponta para o lugar errado.** `OWNER_DOCS_ROOT` é `historias/`, mas `historias/`
  deixou de descrever comportamento de tela. Hoje é um **plano de execução por módulo** (só o
  `README.md` existe). O explorador foi desenhado para ler "a história dona da tela" e derivar dela
  o comportamento esperado; essa fonte sumiu. A fonte real de comportamento e contrato agora é
  `docs/pivot/` (ARQUITETURA, BANCO, SEGURANCA) mais o arquivo de plano do módulo em `historias/`.
- **Referência a arquivo morto.** O explorador cita `historias/13-compliance.md` para regras de copy
  de cobrança. Esse arquivo não existe mais.

### 2.2 Acoplado ao produto velho de cobrança (precisa sumir)

- **Lista de PII/segredos errada.** O explorador trata como P0 "telefone do devedor e do cobrador,
  chave Pix/titular/banco, token, número de convite". Devedor, cobrador e número de convite não
  existem no produto novo. Os segredos que importam agora, em ordem de dano (ver SEGURANCA.md
  seção 2), são **a chave de LLM da loja**, o **token da Meta por loja**, o **Pix da loja** e a
  **PII do cliente final e do motoboy**.
- **Papéis e rotas antigos.** O agente ensina "cobrador (`/app`), devedor (`/meus`), owner
  (`/admin`)". O produto novo tem **membro de loja** (dono, gerente, atendente), escopado por
  `loja_id`, e **operador da plataforma** (equipe Whaviso). As rotas serão outras.
- **Guardrails de ação antigos.** "Não disparar envio de aviso/lembrete/reenviar, não gastar
  crédito, não confirmar pagamento, não aceitar combinado." Crédito, aviso, lembrete e combinado
  morreram. Os efeitos colaterais a evitar agora são outros (ver 2.4).
- **Regra de compliance de cobrança.** A proibição de "dívida, cobrança, atraso, devendo,
  inadimplência" era copy de cobrança. No produto de restaurante ela não se aplica à copy do
  cliente; o travessão proibido e a neutralidade de gênero seguem valendo, a lista de palavras
  proibidas não.

### 2.3 Sobre-engenheirado e caro à toa

- **Cerimônia de artefatos em três camadas.** Cada achado vira: um `.md` com frontmatter de oito
  campos e seis seções no corpo, mais uma linha no `_INDEX.md`, mais (na triagem) uma linha em
  `TASKS.md`, mais um stub de `PLAN.md` por correção. Para um dev solo isso infla o custo por achado
  trivial. Polimento (P3) não precisa de arquivo próprio.
- **Modos demais.** Seis modos de corrida (`guest`, `guest-smoke`, `guest-full`, `smoke`, `core`,
  `full`) para um app que ainda não existe. Três eixos reais bastam: sem login, uma amostra, tudo.
- **Passo cerimonial de reflexão.** O "Passo 5: REFLETE" é um ritual fixo no loop. Útil às vezes,
  mas não todo giro; cabe ser opcional, não etapa obrigatória com nome.
- **Modelo não declarado.** Nenhum dos dois agentes fixa `model` no frontmatter, então herdam o
  modelo do orquestrador. Explorador e triagem têm custos e perfis de juízo diferentes e deveriam
  declarar o seu, senão o giro inteiro pode rodar num modelo caro sem necessidade.

### 2.4 Faltando para o produto novo (o buraco maior)

- **Isolamento multi-tenant (`loja_id`).** O vetor de ataque número um do produto novo (SEC-001 a
  SEC-003, SEC-062) é uma loja ver dado de outra. O explorador só fala genericamente em "trocar
  `:id`/`:token`". Falta: trocar de loja no seletor e confirmar que nenhum dado da loja anterior
  vaza; forjar `loja_id` no payload; confirmar que o **operador da plataforma** vê métricas e
  faturamento, nunca conversas nem pedidos de loja.
- **Chave de LLM nunca exposta.** O ativo mais caro (SEC-020, SEC-025, SEC-026). A tela de
  configuração de chave é **write-only**: deve mostrar só provedor e últimos 4 dígitos, e nenhuma
  resposta de API, nenhum nó do DOM, nenhum payload de rede pode conter o texto claro. O QA de
  navegador é exatamente o lugar de pegar a chave vazando na resposta de um endpoint ou no bundle.
- **Prompt injection e superfície de IA.** O produto antigo "quase não tinha superfície de IA"; o
  novo **é** um atendente de IA. Porém o atendente conversa no WhatsApp, fora do navegador, então a
  injeção conversacional (SEC-060 a SEC-062) é coberta pela suíte `security/` e pelo red team de
  subagents, não pelo Chrome. O que o Chrome alcança são as superfícies de IA **no painel**:
  importação de cardápio por foto/PDF, resumos e gestões para o dono, e o console de teste do
  builder de fluxo. Nessas, a sonda benigna de injeção se aplica.
- **Fluxo de pedido ao vivo.** Kanban de pedidos, conversas em handoff humano, estados de pedido,
  realtime por **SSE** (não mais polling). O QA deve vigiar erro/queda da conexão SSE, pedido preso
  num estado, e o kanban não refletindo um evento.
- **Dois planos.** Painel da loja versus console da plataforma são audiências distintas por escopo
  de auth. O QA precisa exercitar os dois e, sobretudo, a fronteira entre eles (operador não entra
  em conteúdo de loja).

## 3. Proposta: um QA objetivo e barato

A forma geral está certa (explorar de verdade, 1 relatório por achado, triagem como ponte). As
mudanças são de **foco** e de **custo**, não de reescrever a máquina.

### 3.1 Foco

- **Grounding na fonte certa.** `OWNER_DOCS_ROOT` passa a ser `docs/pivot/`. Para a lente de
  Security, a fonte autoritativa é o catálogo `SEC-###` de `SEGURANCA.md`: cada achado de segurança
  cita o `SEC-###` que viola. Para o comportamento de uma tela, o explorador lê também o arquivo de
  plano do módulo em `historias/` quando existir.
- **Manifesto adiado, não fingido.** O `SCREEN_MANIFEST` continua apontando para `docs/qa/PLAN.md`,
  mas fica registrado que ele **não existe** e só deve ser escrito quando o front do produto novo
  tiver rotas reais. Rodar o loop antes disso é prematuro (o app novo ainda não existe).
- **Segredos e papéis atualizados** para a lista da seção 2.2/2.4.

### 3.2 Custo

- **Modelos declarados.** Explorador em **Sonnet** (navegação e juízo entre quatro lentes, muitas
  idas e voltas no navegador, o trabalho pesado). Triagem em **Sonnet** também (deduplicar por causa
  raiz e respeitar fronteira de módulo exige juízo), com nota de que uma rodada pequena de smoke
  pode cair para Haiku. **Opus 4.8 só por escalonamento** (seção 3.3), nunca como padrão: bazuca em
  mosca é desperdício.
- **Menos cerimônia por achado.** Arquivo dedicado só para P0 a P2; P3 (polimento) entra como linha
  no `_INDEX.md`, sem `.md` próprio. Isso corta a maior fonte de inflação de relatório.
- **Menos modos.** `guest`, `smoke`, `core`, `full` (os dois `guest-*` saem).

### 3.3 Contrato de comportamento (objetivo, escala, não insiste)

Este é o coração da proposta e vale para os dois agentes. Em vez de tentar várias coisas e bater
cabeça, o agente identifica o problema, propõe **uma** hipótese e, quando empaca, **escala** em vez
de insistir:

1. **Um problema por vez.** Identifique o sintoma, forme **uma** hipótese de causa, registre o
   achado. Não fique provando variações no escuro além do necessário para reproduzir.
2. **Não bata cabeça.** Ferramenta de navegador falhou 2 vezes, ou a página não responde: pare
   aquele cenário. Repetir a mesma ação esperando resultado diferente é desperdício.
3. **Dúvida factual técnica** (erro de console é conhecido? é comportamento esperado de SSE/React?):
   **uma** busca na web resolve, depois siga. Não deduza no escuro.
4. **Dúvida de julgamento** (isto é bug ou é o comportamento pretendido?) que `docs/pivot/` não
   resolve: pare o cenário e **devolva ao orquestrador recomendando escalar para um especialista
   Opus 4.8**, com a pergunta exata. Não invente o veredito.
5. **Escalar é progresso, insistir é desperdício.** Prefira sempre entregar um bloqueio claro a
   gastar rodadas adivinhando.

Para a triagem, o mesmo princípio: **uma** hipótese de localização e correção por causa raiz, com
`file:line`; causa raiz ambígua ou correção que cruzaria a fronteira de módulo (sinal de desenho
errado) é marcada para **revisão Opus 4.8**, não chutada; a triagem nunca implementa nem inventa a
correção.

**Decisão de desenho (registrada):** o explorador é read-only e **não** recebe a ferramenta de
disparar subagent. Um navegador read-only que abre subagents no meio da exploração é justamente o
padrão de custo descontrolado que queremos evitar. Ele escala **para cima** (devolve ao
orquestrador, que roda no modelo principal e dispara o Opus 4.8), não **para o lado**. Para dúvida
factual, ele tem `WebSearch`/`WebFetch` e se resolve sozinho. Isso honra "escala, não insiste" sem
abrir a torneira de subagents a partir de um agente de navegação.

## 4. Gaps de teste do produto novo que o QA deve cobrir

Alinhados a `SEGURANCA.md` e ao fluxo de pedido. O que o Chrome QA alcança de verdade:

| Área | O que exercitar no navegador | Referência |
|---|---|---|
| Isolamento multi-tenant | trocar de loja no seletor e confirmar que nada da loja anterior persiste; forjar `loja_id` no payload de um request e ver se muda a loja efetiva; pedir por rota um recurso de outra loja | SEC-001, SEC-002 |
| Operador x conteúdo de loja | logado como operador da plataforma, confirmar que conversas/pedidos/mensagens de loja não abrem; só métricas e faturamento | SEC-003 |
| Chave de LLM write-only | tela de config mostra só provedor e últimos 4; varrer respostas de API, DOM e payloads de rede atrás do texto claro da chave | SEC-020, SEC-026 |
| Vazamento no bundle | checar que a service_role não está no bundle do front; só a anon key esperada | SEC-025 |
| Escalonamento de papel | membro de loja não acha endpoint nem caminho de UI que o promova a operador | SEC-041 |
| Superfície de IA no painel | sonda benigna de injeção na importação de cardápio, nos resumos e no console de teste do fluxo | SEC-060 |
| Fluxo de pedido ao vivo | kanban reflete evento; estado de pedido não trava; conexão SSE não cai nem dispara erro de console | ARQUITETURA seção realtime |
| Headers e CORS | HSTS/CSP presentes; origem estranha negada (observável pela aba de rede) | SEC-090 |

**Limite honesto a registrar:** a injeção conversacional de verdade (cliente no WhatsApp tentando
extrair a chave ou cruzar tenant, SEC-060 a SEC-062) **não** é alcançável pelo Chrome QA, porque a
conversa acontece no WhatsApp, fora do navegador. Isso é trabalho da suíte `security/` e do red team
de subagents descrito em `SEGURANCA.md` seção 5. O QA de navegador cobre as superfícies de IA do
painel e o vazamento passivo (resposta, DOM, bundle, rede).

## 5. Decisões tomadas em pontos ambíguos

- **Não criar `docs/qa/PLAN.md` agora.** O produto novo não tem front com rotas; um manifesto seria
  inventado. Fica registrado como pendência para quando o front existir.
- **`OWNER_DOCS_ROOT` passa a `docs/pivot/`**, não `historias/`. `historias/` virou plano de
  execução, não especificação de comportamento de tela; a fonte de "esperado" e de contrato de
  segurança é `docs/pivot/`. O arquivo de módulo em `historias/` entra como leitura secundária.
- **Opus só por escalonamento, explorador sem ferramenta de subagent.** Justificado na seção 3.3.
- **Lente de prompt injection mantida, com escopo corrigido** para as superfícies de IA do painel,
  não para a conversa do WhatsApp.

## 6. Melhorias de baixo risco aplicadas

Mudanças cirúrgicas, preservando MCP conectado, 1 relatório por achado e a triagem:

- **`chrome-qa-loop.config.json`:** `OWNER_DOCS_ROOT` passa para `docs/pivot/`; `_notas` explica que
  `docs/qa/PLAN.md` ainda não existe e deve ser escrito quando o front do produto novo tiver rotas,
  e que a fonte de segurança é o catálogo `SEC-###` de `SEGURANCA.md`.
- **`.claude/skills/chrome-qa-loop/SKILL.md`:** descrição e grounding repontados para `docs/pivot/`;
  nota de que o manifesto não existe ainda; papéis e guardrails atualizados para o produto de
  restaurante (membro de loja x operador; não disparar envio real ao cliente, não confirmar/alterar
  pedido, não mudar preço/cardápio, não completar Pix, não gastar LLM a ponto de custo); segredos P0
  atualizados; modos reduzidos para quatro; regra de P3 sem arquivo próprio; contrato de
  comportamento resumido nos guardrails.
- **`.claude/agents/chrome-qa-explorer.md`:** `model: sonnet` e ferramentas `WebSearch`/`WebFetch`
  no frontmatter; tabela de placeholders, guardrails, lista de PII/segredos, papéis e lente de
  Security reescritos para o produto novo (multi-tenant `loja_id`, chave de LLM, operador x
  conteúdo, SSE); referência a `historias/13-compliance.md` removida; regra de compliance de
  cobrança substituída por travessão e gênero neutro; contrato de comportamento "objetivo, escala,
  não insiste" nas condições de parada.
- **`.claude/agents/qa-report-triage.md`:** `model: sonnet` no frontmatter; regra de escalonamento
  Opus 4.8 para causa raiz ambígua ou correção que cruza fronteira de módulo.

## 7. Recomendado, não aplicado (e por quê)

- **Escrever `docs/qa/PLAN.md` (o manifesto de telas).** Não dá para fazer sem as rotas reais do
  front novo, que ainda não existe. É o próximo passo natural quando a onda 1 do front subir.
- **Suíte `security/` e red team de subagents** para SEC-060 a SEC-062 (injeção conversacional). Fora
  do alcance do Chrome QA e já previsto em `SEGURANCA.md` seção 5; é trabalho de implementação, não
  de ajuste do skill.
- **Tornar o "Passo 5: REFLETE" opcional** em vez de etapa fixa. Deixei como está para não mexer no
  fluxo documentado antes da primeira rodada real validar o que vale cortar.
- **Harness de login para os modos logados.** Login é OAuth Google ou OTP por WhatsApp, feito à mão;
  automatizar foge do escopo desta revisão e tem risco de tocar credencial real.
