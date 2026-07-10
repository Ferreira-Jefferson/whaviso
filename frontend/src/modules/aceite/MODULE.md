# Módulo: aceite

Fluxo público por token: ações dos botões do devedor por link ("Já paguei" / opt-out).

**Papel:** público
**Rotas:** /aviso/:token, /sair-lembretes/:token

> O ACEITE do combinado é 100% pelo WhatsApp (E5): o Whaviso manda o combinado + botões
> direto ao convidado; não há página pública `/aceite/:token` nem contrato de aceite por
> site. Este módulo cobre só as ações do devedor por link (E7).

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`
> (ui, contracts, format, api_client, auth) ou contratos. Páginas exportadas
> lazy em `index.ts`.

## Estado (implementado)
- `data.ts`: TanStack Query: `useAcao` (POST público idempotente). Via
  `@/shared/api_client` (REST `/v1`); nunca SELECT anônimo (RLS deny-all).
- `pages/AcaoAviso.tsx`: `/aviso/:token`: "Já paguei" / "Encerrar lembretes"
  (ConfirmDialog antes do opt-out), sem login.
- `pages/SairLembretes.tsx`: opt-out em 1 clique + recibo.
- `components/`: Transparencia (opt-out visível).

## Mapa de estados do token (descoberto na api)
| Situação | api | UI |
|---|---|---|
| POST token inexistente/inválido | 404 `nao_encontrado` | recibo "Link indisponível" |
| POST acao terminal | 200 `aplicado:false` | recibo do estado atual |
| qualquer rota :token | 429 `limite_excedido` (10/min/IP) | banner "tente em instantes" |
