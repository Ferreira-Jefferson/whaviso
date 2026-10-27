# dashboard (frontend)

## Propósito
Painel da loja com os números do dia e do período: faturamento realizado e em andamento, pedidos,
ticket médio, situação dos pedidos, origem/modalidade, séries por dia e por hora, mais vendidos e
saúde do atendimento (autonomia da IA). Rota `/dashboard` (grupo painel). Somente leitura.

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/dashboard'))`).

## Dados
- `GET /v1/dashboard/resumo | serie-diaria | por-hora | top-itens | atendimento` (query `de`/`ate`).
- Contratos: `@/shared/contracts/_generated/dashboard`. Cache: raiz `['dashboard']`, com
  `keepPreviousData` e refetch a cada 60s.
- Campos financeiros chegam `null` para quem não tem `relatorios:ver` (atendente): os tiles mostram "-".

## Notas
- Períodos (Hoje, 7, 30 dias) calculados em America/Sao_Paulo (`hojeIso`); agregação é do servidor.
- Gráficos em CSS puro (`BarrasVerticais` local) e `GraficoBarras` do design system; sem lib.
- Dinheiro em centavos, exibido por `formatarCentavos`.
