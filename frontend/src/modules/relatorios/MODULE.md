# relatorios (frontend)

## Propósito
BI de fundo da loja, além do dashboard: vendas por dimensão (dia, semana, mês, hora, dia da semana,
origem, modalidade, categoria, item), formas de pagamento, pedidos com problema por motivo e
retenção de clientes por coorte. Rota `/relatorios` (grupo painel). Somente leitura.

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/relatorios'))`).

## Dados
- `GET /v1/relatorios/vendas?agrupar_por=`, `/formas-pagamento`, `/cancelamentos`, `/coortes`.
- Contratos: `@/shared/contracts/_generated/relatorios`. Cache: raiz `['relatorios']`. Cada aba só
  busca quando aberta.
- Exige `relatorios:ver` (dono/gerente): um 403 vira a mensagem "Relatórios restritos".

## Notas
- Períodos 7, 30, 90 dias e 12 meses (limite da api: 366 dias).
- Coortes: só contagens e percentuais, nenhum cliente é identificado. Matriz rola dentro do cartão.
- Dinheiro em centavos.
