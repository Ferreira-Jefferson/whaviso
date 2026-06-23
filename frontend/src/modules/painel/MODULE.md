# Módulo: painel

Dashboard financeiro do cobrador (pendentes/recebidos/pagos/a pagar/totais).

**Papel:** user (área `/app`; aqui o usuário é o `cobrador_id` dos avisos)
**Rotas:** /app

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`
> (ui, contracts, format, api_client, auth) ou contratos. Páginas exportadas
> lazy em `index.ts`.

## Estado (Fase 4 entregue)

- `api.ts`: `usePainelResumo({ de?, ate? })` → `GET /v1/painel/resumo`
  (totais em centavos). Chave `['painel','resumo',periodo]`.
- `pages/Painel.tsx`: StatCards (a receber/recebidos/a pagar/pagos), filtro de
  período opcional na URL (`de`/`ate`) e abas "A receber"/"A pagar" (`aba` na URL)
  que **navegam por rota** para `/app/avisos?direcao=...`, não importam o módulo
  avisos. As mutações do detalhe invalidam a chave `['painel']` para os totais
  acompanharem confirmar/desmarcar/cancelar.
