# Módulo: avisos

Avisos do cobrador: criar e detalhe com ciclo e link de aceite. (A LISTAGEM por papel
mudou-se para o módulo `painel`, que renderiza totais + lista na home unificada `/app`;
a fronteira do lint impede o painel de importar este módulo, por isso o `useAvisos` vive lá.)

**Papel:** user (área `/app`; gerencia avisos como `cobrador_id`)
**Rotas:** /app/avisos/novo, /app/avisos/:id  (a antiga /app/avisos redireciona para /app)

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`
> (ui, contracts, format, api_client, auth) ou contratos. Páginas exportadas
> lazy em `index.ts`.

## Estado (Fase 2 entregue: criar)

- `api.ts`: hooks TanStack Query de mutação/detalhe (`useCriarAviso`, `useAviso`, ...).
  As mutations invalidam a raiz `['avisos']` (avisosKeys.todos) + `['painel']`: a lista
  consolidada no painel usa a chave `['avisos','list', ...]`, então uma ação aqui a
  refaz **por prefixo de string**, sem importação cruzada. O `useAvisos` (listagem,
  `GET /v1/avisos`, envelope paginado `{ itens, total, page, per_page }`) vive em
  `modules/painel/api.ts`.
- `schemas.ts`: schema do formulário. `direcao=pagar` é lembrete a si mesmo:
  SEM aceite/WhatsApp, telefone não exigido, nasce `programado`, `link_aceite=null`.
  `direcao=receber` exige telefone (E.164) e a resposta traz `link_aceite`.
- `pages/NovoAviso.tsx`: formulário dinâmico por direção; trata
  `limite_plano_atingido` (HTTP 422) com upsell.
- `components/AvisoCriado.tsx`: sucesso: CopyLinkButton + wa.me (receber) ou
  confirmação simples (pagar).

## Estado (Fase 4 entregue: detalhe + ciclo + ações)

- `api.ts`: `useAviso(id)` (`GET /v1/avisos/:id`, só o aviso),
  `useAvisoEnvios`/`useAvisoEventos` (degradam graciosamente quando os endpoints
  `/avisos/:id/envios` e `/avisos/:id/eventos` ainda não existem no backend → 404
  vira `{ itens: [], indisponivel: true }`, sem quebrar a UI),
  `useConfirmarRecebimento`/`useDesmarcarRecebimento` (**otimistas**, reversíveis),
  `useCancelarAviso` (**pessimista**). Todas invalidam detalhe+envios+eventos+
  `['avisos']`+`['painel']` (a lista no painel cai sob a raiz `['avisos']`).
- `pages/DetalheAviso.tsx`: dados + `CycleTimeline` (só `direcao=receber`,
  derivada dos envios reais; etapa nunca calculada no cliente) + histórico de
  eventos (notificações in-app, risco nº 10) + ações por status. Cancelar usa
  `ConfirmDialog` e invalida os envios para a timeline refletir o cancelamento.

> **Gap de backend conhecido:** `GET /v1/avisos/:id` devolve só o aviso; não há
> endpoint que exponha `envios[]`/`eventos[]` por aviso. A UI já consome
> `/avisos/:id/envios` e `/avisos/:id/eventos` (shape `Envio[]`/`EventoAviso[]`):
> quando o backend os adicionar, a timeline e o histórico passam a popular sem
> mudança no front.
