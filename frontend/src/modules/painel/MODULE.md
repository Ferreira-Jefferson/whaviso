# Módulo: painel

Home ÚNICA de quem tem conta (`/app`): totais por papel + "precisa de você" + a
LISTA de combinados, tudo numa página só (E9). Consolidou a antiga tela de Avisos.

**Papel:** user (área `/app`; aqui o usuário é o `cobrador_id`/`devedor_profile_id`)
**Rotas:** /app

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`
> (ui, contracts, format, api_client, auth) ou contratos. Páginas exportadas
> lazy em `index.ts`.

## Estado

- `api.ts`:
  - `usePainelResumo({ de?, ate? })` → `GET /v1/painel/resumo` (totais em centavos).
    Chave `['painel','resumo',periodo]`.
  - `usePainelPendencias()` → `GET /v1/painel/pendencias` ("precisa de você").
  - `useAvisos(filtros)` → `GET /v1/avisos` (lista paginada por papel). Vive AQUI
    porque a página `/app` renderiza totais + lista juntos e o lint proíbe importar
    o módulo `avisos`. A chave é `['avisos','list',filtros]`: a raiz `['avisos']` é
    um **contrato de string** com o módulo avisos (cujas mutations invalidam essa
    raiz), para a lista se refazer após ações sem importação cruzada.
- `pages/Painel.tsx`: PageHeader + "precisa de você" + filtro de período na URL
  (`de`/`ate`, hoje rege os totais) + 4 StatCards + a seção **Combinados** (lista por
  papel com faixas Ativos/Sem aviso/Encerrados, busca e filtro de situação; `papel`/
  `grupo`/`status`/`busca` na URL). Clique na linha abre `/app/avisos/:id`.
