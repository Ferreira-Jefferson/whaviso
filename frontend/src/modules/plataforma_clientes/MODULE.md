# plataforma_clientes (frontend)

## Proposito
Console do OPERADOR (equipe Whaviso): restaurantes como clientes da plataforma. Espelha
`backend/apps/api/src/modules/plataforma_clientes`. Nao e tela de loja.

## Telas
- `pages/Clientes.tsx`: abas.
  - Contas (`PainelContas`): busca por nome (min. 2 letras, debounce 300 ms), filtro por situacao
    (trial/ativa/suspensa/cancelada/sem assinatura), "Carregar mais" por cursor, clique abre a ficha.
  - `FichaContaDialog`: situacao, saude do WhatsApp, assinatura (so leitura), lojas (status do numero,
    nunca o numero) e membros (papel + ref. opaca, sem contato).
  - Equipe Whaviso (`PainelEquipe`): lista de operadores, vincular usuario existente (id do Auth),
    trocar papel, desativar/reativar (ConfirmDialog). So admin: 403 vira "Só administradores".

## Dados
- Prefixo `/v1/plataforma-clientes`: `GET /contas`, `GET /contas/:id`, `GET|POST /operadores`,
  `PATCH /operadores/:id`. Contratos: `@/shared/contracts/_generated/plataforma_clientes`.
- Cache raiz `['plataforma_clientes']`. Rotas de operador: `semLoja: true` (sem `x-loja-id`).

## Privacidade
- Nada de conversa, pedido, cliente final, endereco ou contato (telefone/e-mail). Membro aparece so por
  papel e referencia curta do id.
- Suspender/reativar assinatura NAO mora aqui: e do modulo plataforma_cobranca.

## Primitivos locais
`AreaErro` (403 -> acesso restrito), `rotulos.ts` (situacao, saude, papeis).
