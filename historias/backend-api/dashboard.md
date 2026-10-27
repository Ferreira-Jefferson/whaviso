# API-dashboard dashboard (loja)

- **ID:** API-dashboard  ·  **Área:** API  ·  **Onda:** 4
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Read-model de métricas **da loja** para o painel: faturamento, pedidos, ticket médio, pedidos por
status/origem/hora, itens mais vendidos, tempo médio de entrega e saúde do atendimento (conversas
abertas, em atendimento humano, taxa de pedidos fechados sem intervenção humana). Suporta **uma loja ou o
consolidado das lojas** a que o membro tem acesso, por período.

"Pronto" observável: `GET /dashboard/resumo?de=&ate=&loja_id=` e rotas auxiliares devolvem números que
conferem com fixtures; o membro só enxerga as lojas do seu escopo (`loja_id` fora do escopo = 403/404);
um dia em America/Sao_Paulo é respeitado na fronteira da meia-noite.

## Dependências

- `API-pedidos`: tabelas `pedidos`/`itens_pedido` existentes e semântica de status; o dashboard só lê.
- `API-conversas`: tabelas `conversas`/`mensagens` e o significado de `status` (`ia/humano/encerrada`).
- (herdadas) `F4`, `F3` escopo de loja.

## Contratos e tabelas que toca

- **Dono de escrita:** nenhuma. Puro read-model (leitura cruzada somente `SELECT` via `shared/db`,
  documentada no `MODULE.md`; nunca importa módulo).
- **Lê:** `pedidos` (status, origem, modalidade, totais, `criado_em`, `entregue_em`, `zona_id`),
  `itens_pedido` (`nome_snapshot`, `quantidade`, `preco_unitario_centavos`), `conversas` (`status`,
  `criado_em`), `lojas` (nome, para o consolidado).
- **Definições (fonte única em `metricas.ts`):**
  - **Faturamento** = soma de `total_centavos` de pedidos `entregue` (realizado) e, em separado,
    "em andamento" (`novo|em_preparo|saiu_entrega`). `rascunho` e `problema` não entram no faturamento;
    `problema` aparece como contagem.
  - **Ticket médio** = faturamento realizado / pedidos entregues (`null` se zero).
  - **Tempo médio de entrega** = média de `entregue_em - criado_em` (minutos) dos entregues no período.
  - **Taxa de autonomia da IA** = pedidos do período cuja conversa nunca esteve em `humano` / pedidos
    com conversa. Se não for derivável só das tabelas, decisão abaixo.
- **Contratos Zod:** `DashboardFiltro` (`de`, `ate` datas de negócio; `loja_id` opcional),
  `DashboardResumo`, `SeriePorDia`, `SeriePorHora`, `TopItem`, `AtendimentoSaude`.
- **Rotas:** `GET /dashboard/resumo`, `GET /dashboard/serie-diaria`, `GET /dashboard/por-hora`,
  `GET /dashboard/top-itens`, `GET /dashboard/atendimento`.
- **Realtime (opcional, etapa final):** consome o canal SSE de pedidos (F5) só para o front invalidar a
  query; o módulo não emite evento.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/dashboard_loja/**`
- `backend/packages/shared/src/contracts/dashboard.ts`
- `backend/apps/api/src/routes.ts` (1 linha)
- `backend/apps/api/test/security/dashboard.*.test.ts`
- Migration **somente se** o `EXPLAIN` provar necessidade: `backend/supabase/migrations/00NN_dashboard_indices.sql`
  (índice `pedidos (loja_id, criado_em)`); caso contrário, nenhuma migration.

## Etapas

- [ ] 1. Scaffold + `MODULE.md` com tabelas lidas e definições de métrica  (commit: `feat(dashboard): scaffold do modulo`)
- [ ] 2. Contratos Zod + `gen_contracts`  (commit: `feat(contracts): contratos do dashboard`)
- [ ] 3. Utilitário de período: converte `de/ate` (datas de negócio, America/Sao_Paulo, `ate` inclusivo)
  para intervalo UTC semiaberto `[inicio, fim)`; limite de 366 dias; default = hoje e últimos 30 dias
  (commit: `feat(dashboard): normalizacao de periodo em America/Sao_Paulo`)
- [ ] 4. `metricas.ts` puro (ticket médio, tempo médio, razões com `null` em divisão por zero)
  e testes de unidade  (commit: `feat(dashboard): definicoes de metricas`)
- [ ] 5. Resolução de escopo: `loja_id` opcional; ausente = todas as lojas do membro
  (`ANY($lojas_do_usuario)`); presente e fora do escopo = 404. Nenhuma query sem filtro de loja
  (commit: `feat(dashboard): escopo por loja e consolidado`)
- [ ] 6. Query `resumo` (uma passada em `pedidos` com `COUNT/SUM ... FILTER`), valores em centavos
  (commit: `feat(dashboard): resumo de pedidos e faturamento`)
- [ ] 7. Séries por dia e por hora (`date_trunc` em `AT TIME ZONE 'America/Sao_Paulo'`, preenchendo
  dias/horas sem pedido com zero via `generate_series`)  (commit: `feat(dashboard): series por dia e hora`)
- [ ] 8. Top itens (`itens_pedido` agrupado por `nome_snapshot`, limite 10, só pedidos não `rascunho`)
  (commit: `feat(dashboard): itens mais vendidos`)
- [ ] 9. Saúde do atendimento: conversas por status; taxa de autonomia conforme decisão (abaixo)
  (commit: `feat(dashboard): saude do atendimento`)
- [ ] 10. Verificar `EXPLAIN (ANALYZE)` em banco semeado com 50 mil pedidos; criar índice só se
  necessário  (commit: `perf(dashboard): indice de periodo` apenas se houver)
- [ ] 11. Testes de integração (fixtures com 2 lojas, fuso, `rascunho`/`problema`, consolidado) e
  registro em `routes.ts`  (commit: `test(dashboard): integracao e registro`)
- [ ] Testes passando; lint, typecheck, test

## Testes e segurança exigidos

- **SEC-001/002**: membro da loja A nunca vê números da B, nem pelo consolidado; `loja_id` forjado fora
  do escopo retorna 404; consolidado soma só as lojas do escopo.
- **SEC-003**: operador da plataforma recebe 403 nestes endpoints (conteúdo/uso de loja).
- **SEC-080/081**: `de/ate` e `loja_id` validados por Zod (formato data, uuid); toda query parametrizada.
- Papéis: `atendente` vê apenas contagens operacionais (decisão: faturamento e ticket exigem `dono` ou
  `gerente`); teste de matriz de papel.
- Unidade/integração: virada de dia em UTC-3, pedido às 23:59 e 00:01, centavos inteiros, período
  vazio devolve zeros e `null` (não erro), limite de 366 dias rejeita com 400.

## Notas e decisões

- **Taxa de autonomia da IA:** o schema não guarda "já houve handoff nesta conversa" depois que ela
  volta para `ia`. Decisão: v1 usa a **foto atual** (conversas do período e quantas estão em `humano`)
  e a proporção de pedidos cuja conversa **não** tem `humano_desde` preenchido. Se `API-handoff` passar a
  registrar `eventos` de handoff, esta métrica migra para contar por eventos sem mudar o contrato.
- **Sem cache** na v1 (consultas indexadas e por período); o front usa TanStack Query com
  invalidação por SSE.
- **Multi-loja consolidado** entra aqui como parâmetro, não como módulo novo.
- Métricas de custo de LLM (`uso_llm`) pertencem a `configuracoes_llm`, não ao dashboard.
