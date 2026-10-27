# crm (frontend)

## Proposito
CRM do restaurante sobre o consumidor final: lista de clientes com segmento RFM e filtros,
ficha por cliente (metricas, notas R/F/M, itens favoritos, ultimos pedidos), aba "O que compram"
(itens mais vendidos) e opt-out de marketing. Rota `/crm`.

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/crm'))` no registry de rotas).

## Dados
- `GET /v1/crm/clientes` (segmento, contactavel, cursor), `GET /v1/crm/clientes/:id`,
  `GET /v1/crm/resumo`, `GET /v1/crm/itens?dias`, `PUT /v1/crm/clientes/:id/consentimento`.
- Contratos: `@/shared/contracts/_generated/crm` (nao redefinir). Cache: raiz `['crm']`; a mudanca
  de consentimento invalida a raiz inteira (lista, resumo e ficha).

## Regras
- Segmento e notas RFM vem prontos da view do backend; nada e calculado no cliente.
- Opt-out e primeira classe: selo "Nao contactar" na lista, filtro "so quem pode receber campanha"
  (`contactavel=true`), acao de marcar/reverter na ficha (com motivo opcional, origem `painel`).
- PII: nenhum telefone trafega neste modulo (o contrato nao tem). A ficha de contato fica em `/clientes`.
- Leituras exigem `relatorios:ver` e o opt-out `pedidos:gerir`; sem permissao a tela mostra o estado de erro.

## Primitivos locais
- `segmentos.ts` (rotulos, tons e dicas dos segmentos), `SeloSegmento`.
