# Módulo: avisos

CRUD de avisos do cobrador: criar, listar, detalhe com ciclo e link de aceite.

**Papel:** user (área `/app`; gerencia avisos como `cobrador_id`)
**Rotas:** /app/avisos, /app/avisos/novo, /app/avisos/:id

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`
> (ui, contracts, format, api_client, auth) ou contratos. Páginas exportadas
> lazy em `index.ts`.

## Estado (Fase 2 entregue: criar + lista)

- `api.ts`: hooks TanStack Query (`useAvisos`, `useCriarAviso`). A listagem
  `GET /v1/avisos` é um **envelope paginado** `{ itens, total, page, per_page }`,
  não um array nu.
- `schemas.ts`: schema do formulário. `direcao=pagar` é lembrete a si mesmo:
  SEM aceite/WhatsApp, telefone não exigido, nasce `programado`, `link_aceite=null`.
  `direcao=receber` exige telefone (E.164) e a resposta traz `link_aceite`.
- `pages/NovoAviso.tsx`: formulário dinâmico por direção; trata
  `limite_plano_atingido` (HTTP 422) com upsell para `/app/plano`.
- `components/AvisoCriado.tsx`: sucesso: CopyLinkButton + wa.me (receber) ou
  confirmação simples (pagar).
- `pages/ListaAvisos.tsx`: filtros na URL (status/busca/**direcao**),
  TableResponsive. `direcao` permite o link do painel (`?direcao=receber|pagar`).

## Estado (Fase 4 entregue: detalhe + ciclo + ações)

- `api.ts`: `useAviso(id)` (`GET /v1/avisos/:id`, só o aviso),
  `useAvisoEnvios`/`useAvisoEventos` (degradam graciosamente quando os endpoints
  `/avisos/:id/envios` e `/avisos/:id/eventos` ainda não existem no backend → 404
  vira `{ itens: [], indisponivel: true }`, sem quebrar a UI),
  `useConfirmarRecebimento`/`useDesmarcarRecebimento` (**otimistas**, reversíveis),
  `useCancelarAviso` (**pessimista**). Todas invalidam detalhe+envios+eventos+
  lista+`['painel']`.
- `pages/DetalheAviso.tsx`: dados + `CycleTimeline` (só `direcao=receber`,
  derivada dos envios reais; etapa nunca calculada no cliente) + histórico de
  eventos (notificações in-app, risco nº 10) + ações por status. Cancelar usa
  `ConfirmDialog` e invalida os envios para a timeline refletir o cancelamento.

> **Gap de backend conhecido:** `GET /v1/avisos/:id` devolve só o aviso; não há
> endpoint que exponha `envios[]`/`eventos[]` por aviso. A UI já consome
> `/avisos/:id/envios` e `/avisos/:id/eventos` (shape `Envio[]`/`EventoAviso[]`):
> quando o backend os adicionar, a timeline e o histórico passam a popular sem
> mudança no front.
