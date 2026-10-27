# FR-negocio telas de negócio

- **ID:** FR-negocio  ·  **Área:** FR  ·  **Onda:** 4
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (preencher ao começar; um rótulo por tela)

## Objetivo

Entregar duas famílias de tela: o **dashboard da loja** (plano da loja, membros) e o **console da
plataforma** (plano do operador, equipe Whaviso: clientes, cobrança, funil, painel de crescimento).
"Pronto" observável: o dono vê métricas da própria loja; a equipe Whaviso gere restaurantes, assinaturas,
funil de aquisição e crescimento da base, **sem nunca ver conteúdo de cliente final**.

**Regra central (inegociável):** a PRIMEIRA etapa de cada tela é um **artifact visual** (desktop +
mobile, bonito e organizado, inspirado em referências de design de produto), aprovado antes de qualquer
código; só então transpor para React, fiel ao artifact, sem degradar. Ver
[../README.md](../README.md), "Front-end: design primeiro, código depois".

## Dependências

- `F6` front-shell (todas as telas) e `F3` (escopo de operador resolvido no token, exposto ao front pelo
  shell).
- Por tela (código só com a API concluída; artifact pode adiantar):
  - Dashboard da loja: `API-dashboard` (que depende de `API-pedidos`, `API-conversas`).
  - Console, clientes: `P-clientes`.
  - Console, cobrança: `P-cobranca`.
  - Console, funil: `P-funil`.
  - Console, painel de crescimento: `P-painel` (depende de `P-cobranca`, `P-clientes`).
- O dashboard enriquece com dados de `FR-nucleo`/`FR-entrega`, mas **não importa** esses módulos; lê só o
  read-model da api.

## Contratos e tabelas que toca

O front não toca tabela. Consome `frontend/src/shared/contracts/_generated/` (nomes finais conforme F1):
- Dashboard: métricas agregadas da loja (pedidos por período, faturamento em centavos, ticket médio,
  tempo médio de preparo/entrega, conversas, taxa de conversão, horários de pico).
- Console clientes: conta/loja como cliente (nome, plano, status, datas), **sem** pedidos/conversas.
- Cobrança: assinatura, fatura (valor, vencimento, status, inadimplência), ações de suspender/reativar.
- Funil: prospecto, atividade (follow-ups), estágio.
- Painel: MRR, churn, lojas ativas, inadimplência, série histórica.

## Arquivos (escopo de edição)

Dois sub-aplicativos no mesmo SPA, separados por **escopo de auth** (membro vs operador), cada um com as
suas rotas protegidas por guarda do shell.
- `frontend/src/modules/dashboard/**`
- `frontend/src/modules/plataforma/clientes/**`
- `frontend/src/modules/plataforma/cobranca/**`
- `frontend/src/modules/plataforma/funil/**`
- `frontend/src/modules/plataforma/painel/**`
- Rotas: 1 linha por módulo no registry do shell; layout do console (navegação própria) é parte de T2.
- Sem HTML de artifact em `frontend/src`.

## Convenções comuns

- TanStack Query; chaves por `lojaId` (dashboard) ou por escopo de operador (console). `loja_id` nunca
  no payload escolhido pela tela.
- Dinheiro em centavos; datas de negócio em America/Sao_Paulo; períodos (hoje, 7d, 30d) enviados como
  parâmetro e **agregados no servidor** (o front nunca soma linhas para fabricar métrica).
- Gráficos: seguir a skill/guia de dataviz do projeto (paleta acessível, legível em claro e escuro,
  rótulos e tabela alternativa para leitor de tela); sem biblioteca nova sem aprovação (preferir uma
  única lib de gráficos, decidida em T1 e reusada no console via `shared`).
- Estados: carregando (skeleton), vazio ("sem dados no período"), erro, sem permissão.
- Sem travessão em texto/código/commit; sem menção a IA; copy neutra de gênero.

## Padrão de etapas por tela (1 linha = 1 commit atômico)

**A (artifact) -> B (transpor) -> C (testes)**; prefixo `T#`. A1 artifact desktop (>=1280) e mobile (390),
estados vazio/erro/carregando, claro e escuro, 3 referências; A2 aprova e registra link/data; B só
depois; ao fim de B, comparar artifact x tela real (screenshots) e corrigir.

---

## T1 Dashboard da loja

Objetivo: visão rápida da saúde da loja no período: faturamento, pedidos, ticket médio, tempos,
conversão do atendimento e picos de horário.

Etapas:
- [ ] T1-A1 Artifact desktop + mobile: faixa de KPIs com variação vs período anterior, gráfico de
  pedidos/faturamento no tempo, mapa de calor de horários de pico, ranking de itens mais vendidos,
  seletor de período; mobile em cartões empilhados
- [ ] T1-A2 Aprovação do artifact
- [ ] T1-B1 Rota `dashboard` + seletor de período e faixa de KPIs  (commit: `feat(front/dashboard): kpis e periodo`)
- [ ] T1-B2 Gráfico série temporal (pedidos e faturamento), com tooltip, legenda e alternativa
  tabular acessível  (commit: `feat(front/dashboard): serie temporal`)
- [ ] T1-B3 Horários de pico (heatmap) e itens mais vendidos  (commit: `feat(front/dashboard): picos e ranking`)
- [ ] T1-B4 Estados vazio/erro/skeleton, atualização periódica ou via SSE se a api expuser evento, mobile
  (commit: `feat(front/dashboard): estados e responsivo`)
- [ ] T1-C1 Testes: formatação (centavos, percentuais, variação), troca de período refaz a consulta,
  estado vazio, tabela alternativa presente  (commit: `test(front/dashboard): ...`)

Arquivos: `frontend/src/modules/dashboard/**`. Depende de `API-dashboard`.

## T2 Console da plataforma: layout e Clientes (restaurantes)

Objetivo: casca do console (navegação, guarda de operador) e lista/ficha dos restaurantes como clientes
da Whaviso: status, plano, datas, lojas. **Nunca** mostra conversas, pedidos ou clientes finais deles.

Etapas:
- [ ] T2-A1 Artifact desktop + mobile: layout do console (navegação lateral: Clientes, Cobrança, Funil,
  Painel) distinto do painel da loja para o operador nunca confundir os planos; lista de restaurantes
  com filtros de status, ficha com resumo de conta
- [ ] T2-A2 Aprovação do artifact
- [ ] T2-B1 Layout do console + guarda de rota por escopo de operador (membro comum é redirecionado e
  não enxerga o item de navegação)  (commit: `feat(front/plataforma): layout e guarda de operador`)
- [ ] T2-B2 Lista de clientes com busca/filtro/paginação  (commit: `feat(front/plataforma-clientes): lista`)
- [ ] T2-B3 Ficha do restaurante (conta, lojas, plano, status, datas), ações permitidas pelo contrato;
  estados e mobile  (commit: `feat(front/plataforma-clientes): ficha e estados`)
- [ ] T2-C1 Testes: guarda de operador (membro nunca vê o console), ficha não renderiza campo de
  conteúdo mesmo se a resposta o trouxesse por engano (render por allowlist de campos)
  (commit: `test(front/plataforma-clientes): ...`)

Arquivos: `frontend/src/modules/plataforma/clientes/**` (+ layout no mesmo módulo; decisão: o layout do
console nasce em T2 e as telas T3..T5 o reusam **via rota aninhada declarada no shell**, não por import
entre módulos). Depende de `P-clientes`, `F3`.

## T3 Console: Cobrança (assinaturas e faturas)

Objetivo: gerir a assinatura restaurante -> Whaviso: faturas, vencimentos, inadimplência, suspensão e
reativação.

Etapas:
- [ ] T3-A1 Artifact desktop + mobile: tabela de faturas com status (paga, aberta, vencida), filtros,
  detalhe da assinatura, ação suspender/reativar com confirmação e motivo, timeline de eventos
- [ ] T3-A2 Aprovação do artifact
- [ ] T3-B1 Rota `plataforma/cobranca` + lista de faturas e filtros  (commit: `feat(front/cobranca): faturas`)
- [ ] T3-B2 Detalhe da assinatura e timeline  (commit: `feat(front/cobranca): assinatura`)
- [ ] T3-B3 Suspender/reativar (confirmação, motivo obrigatório, refetch após sucesso, sem otimista por
  ser ação financeira); estados e mobile  (commit: `feat(front/cobranca): acoes e estados`)
- [ ] T3-C1 Testes: status exibido vem da api, ação destrutiva exige confirmação e motivo, erro da api
  não muda estado local  (commit: `test(front/cobranca): ...`)

Arquivos: `frontend/src/modules/plataforma/cobranca/**`. Depende de `P-cobranca`. Toca dado financeiro:
revisão Opus antes de `CONCLUIDO` (STATUS.md).

## T4 Console: Funil de aquisição

Objetivo: CRM simples de prospectos: estágios, atividades e follow-ups até virarem clientes ativos.

Etapas:
- [ ] T4-A1 Artifact desktop + mobile: quadro de estágios (kanban) e lista alternativa, ficha do
  prospecto com timeline de atividades, agenda de follow-ups do dia, atalho para registrar atividade
- [ ] T4-A2 Aprovação do artifact
- [ ] T4-B1 Rota `plataforma/funil` + quadro por estágio (leitura)  (commit: `feat(front/funil): quadro`)
- [ ] T4-B2 Ficha do prospecto, criar/editar prospecto, mover de estágio (drag com fallback por botões)
  (commit: `feat(front/funil): ficha e movimentacao`)
- [ ] T4-B3 Registrar atividade e follow-up, visão "hoje"; estados e mobile  (commit: `feat(front/funil): atividades e followups`)
- [ ] T4-C1 Testes: reducer de movimentação, validação do formulário de atividade, lista de follow-ups
  do dia por data de negócio  (commit: `test(front/funil): ...`)

Arquivos: `frontend/src/modules/plataforma/funil/**`. Depende de `P-funil`.

## T5 Console: Painel de crescimento

Objetivo: visão executiva da base: MRR, churn, lojas ativas, inadimplência e evolução.

Etapas:
- [ ] T5-A1 Artifact desktop + mobile: KPIs (MRR, churn, lojas ativas, inadimplência), série histórica,
  composição da base por plano/estágio, comparativo entre períodos
- [ ] T5-A2 Aprovação do artifact
- [ ] T5-B1 Rota `plataforma/painel` + KPIs e seletor de período  (commit: `feat(front/painel): kpis`)
- [ ] T5-B2 Gráficos de série e composição (mesma lib e tokens do dashboard da loja, via `shared`)
  (commit: `feat(front/painel): graficos`)
- [ ] T5-B3 Estados e mobile, tabela alternativa acessível  (commit: `feat(front/painel): estados e responsivo`)
- [ ] T5-C1 Testes: formatação de MRR/percentuais, troca de período, vazio  (commit: `test(front/painel): ...`)

Arquivos: `frontend/src/modules/plataforma/painel/**`. Depende de `P-painel`.

---

## Divisão por tela (paralelismo)

T1 (loja) é independente do console. Dentro do console, T2 vem primeiro (layout e guarda), depois
T3, T4 e T5 em paralelo. O componente de gráfico comum (T1/T5) é criado uma vez no `shared` em commit
separado, e a segunda tela o reusa; serializar essa etapa.

## Testes e segurança exigidos

- Testes de componente/estado por tela (cada C1) + `lint`, `typecheck`, `build` verdes.
- **SEC-003** (cliente): o console só exibe métricas e faturamento; nenhuma rota do console aponta para
  conteúdo de loja, e o render é por allowlist de campos. Guarda de rota por escopo de operador.
- **SEC-041** (cliente): nenhuma interface promove membro a operador; a UI não oferece essa ação.
- **SEC-025**: bundle sem `service_role`/segredo; nenhuma `VITE_*` com segredo (grep em `dist/`).
- **SEC-090**: sem script/estilo inline ou origem externa nova (a lib de gráficos vai no bundle, não de CDN).
- **SEC-001/SEC-002** (cliente): sem `loja_id` escolhido pela tela; troca de loja invalida o cache.
- Revisão Opus em T3 (financeiro).

## Design (FR-*)

Um artifact por tela, desktop + mobile. Preencher ao aprovar:
- T1 Dashboard da loja: link `<pendente>`  ·  aprovado em `<data>`
- T2 Console, layout e Clientes: link `<pendente>`  ·  aprovado em `<data>`
- T3 Console, Cobrança: link `<pendente>`  ·  aprovado em `<data>`
- T4 Console, Funil: link `<pendente>`  ·  aprovado em `<data>`
- T5 Console, Painel: link `<pendente>`  ·  aprovado em `<data>`

Referências sugeridas: dashboards de produto (Stripe Dashboard, Linear Insights, Vercel Analytics),
billing de SaaS (Stripe Billing, Chargebee), CRM de funil (Pipedrive, Attio). Tokens do ui kit de F6.

## Notas e decisões

- Dois planos, uma SPA: o console da plataforma tem identidade visual de navegação distinta (para o
  operador nunca confundir com a loja) e é protegido por escopo de operador; o servidor é quem decide
  (a guarda do front é conveniência, não segurança).
- Multi-loja consolidado (ARQUITETURA, onda 4) **não** consta no STATUS para este módulo: fica fora e
  vira etapa extra só se um módulo de API o pedir.
- Handoff humano (`API-handoff`) pertence à tela de conversas do FR-nucleo, não a este arquivo.
- Travou: escalar a especialista Opus ou pesquisar na web e registrar aqui.
