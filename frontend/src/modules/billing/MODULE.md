# Módulo: billing

Plano vigente, troca de plano e uso da agenda (uso vs capacidade). Catálogo de 4
planos (Free/Start/Profissional/Plus) com agenda balde único; Plus vendido por
unidade.

**Papel:** user (área `/app`)
**Rotas:** /app/plano

## Dados (api.ts): mapa REAL do backend
- `GET /v1/billing/planos` → `{ planos: [{ id, nome, preco_centavos, capacidade_agenda, vagas_ativas, por_unidade, agenda_por_unidade, ativaveis_por_unidade, cadencia_configuravel, menu_texto_livre, informado_pago_habilitado, totais_periodo, permite_recorrente, somente_leitura }] }`
- `GET /v1/billing/assinatura` → plano vigente + alavancas EFETIVAS (capacidade/vagas já resolvidas por unidade no Plus); a conta nasce no free
- `POST /v1/billing/assinar` `{ plano_id, unidades? }` → grava `status='trial'` (stub, sem gateway). Plus exige `unidades`.
- Contador de uso: NÃO há endpoint dedicado. Enquanto `sem_aviso` (E4) não existe, agenda = `qtd_pendentes + qtd_aguardando_aceite` de `GET /v1/painel/resumo`.

## Upsell / limite (H11.6)
O limite é DECIDIDO PELO BACKEND. A UI só espelha o contador e as alavancas do
plano; não reimplementa a regra. Quem recusa é a api (422 `plano_somente_leitura`
no free, `agenda_cheia` ao encher), tratado no formulário de novo aviso (CTA com
link pra cá). A CTA nunca destrói trabalho: o item fica salvo.

> Fronteira: este módulo NUNCA importa de outro módulo. Coordene via `@/shared/*`.
> Páginas exportadas lazy em `index.ts`.
