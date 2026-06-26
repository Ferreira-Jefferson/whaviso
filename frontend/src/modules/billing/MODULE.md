# Módulo: billing

Carteira de créditos de envio (Épico 11, pré-pago): saldo (livre/reservado/em hold/
consumido), slider de quantidade com preço ao vivo (curva do catálogo) e extrato dos
lançamentos. Compra MANUAL via WhatsApp (o owner credita depois); não há gateway nem
auto-crédito no front.

**Papel:** user (área `/app`)
**Rotas:** /app/creditos

## Dados (api.ts): mapa REAL do backend
- `GET /v1/billing/carteira` → `{ carteira: { saldo_livre, reservado, em_hold, consumido, ja_comprou }, catalogo: { envios_min, envios_max, preco_centavos, preco_max_centavos, cortesia_inicial, agenda_teto_free, agenda_teto_pago } }`
- `GET /v1/billing/extrato?page=` → lançamentos paginados (compra/crédito/reserva/consumo/devolução/hold)

## Limite (H11.4/H11.9)
O limite é DECIDIDO PELO BACKEND: o front só espelha o saldo. Ativar sem crédito recusa
com 422 `saldo_insuficiente`, tratado no formulário de novo aviso (CTA "Recarregar
créditos" com link pra cá). A CTA nunca destrói trabalho: o item fica salvo na agenda.
O preço é a mesma função no front e no back (`precoEnvioCentavos`, fonte única).

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`.
> Páginas exportadas lazy em `index.ts`.
