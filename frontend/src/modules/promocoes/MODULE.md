# promocoes (frontend)

## Proposito
CRUD de cupons (percentual e valor fixo) e combos da loja, com validade, limites de uso, pedido
minimo, teto de desconto e liga/desliga, mais um simulador de cupom. Rota `/promocoes`.

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/promocoes'))`).

## Dados
- `GET|POST /v1/promocoes`, `PATCH /v1/promocoes/:id`, `POST /v1/promocoes/validar`;
  `GET /v1/cardapio` (so leitura, para escolher os itens do combo).
- `/aplicar` e `/usos` pertencem ao fluxo de pedidos e nao sao usados aqui.
- Contratos: `@/shared/contracts/_generated/promocoes` e `cardapio`. Cache: raiz `['promocoes']`.

## Regras
- Sem DELETE: desligar (`ativo=false`) e o caminho; o interruptor da lista faz PATCH `{ ativo }`.
- Tipo, codigo e itens do combo sao imutaveis: a edicao mostra so leitura e orienta a criar outra promocao.
- `valor`: percentual 1..100 (cupom percentual), centavos (cupom fixo) ou preco final do combo em centavos.
- Datas: `datetime-local` em horario de Sao Paulo; enviadas como ISO com offset `-03:00` (sem horario de verao desde 2019) e lidas de volta em America/Sao_Paulo.
- A "Situacao" da lista (vigente, agendada, expirada, esgotada, desligada) e so rotulo derivado dos campos devolvidos; quem decide se um cupom vale e o backend (`/validar`).
- Criar/editar exige dono/gerente; sem permissao a tela cai no estado de erro.

## Lacunas de API
- `GET /promocoes/:id` existe mas a tela usa os dados da lista (sem necessidade de detalhe).
- Nao ha ordenacao nem busca por nome/codigo na lista.

## Primitivos locais
- Usa o `Switch` compartilhado (`@/shared/ui`); na linha da tabela ele vai dentro de um span que barra a propagacao do clique (a linha abre a edicao). Helpers de data/situacao em `estados.ts`.
