# plataforma_usuarios (frontend)

## Proposito
Console do OPERADOR (equipe Whaviso): usuarios da plataforma (donos de restaurante, equipe deles
ou equipe interna da Whaviso). Espelha `backend/apps/api/src/modules/plataforma_usuarios`. Nao e
tela de loja.

## Telas
- `pages/Usuarios.tsx`: abas.
  - Contas (`PainelContas`): busca por nome (min. 2 letras, debounce 300 ms), filtro por situacao
    (trial/ativa/suspensa/cancelada/sem assinatura), "Carregar mais" por cursor, clique abre a ficha.
    Botao "Novo usuário" abre `NovoUsuarioDialog`.
  - `NovoUsuarioDialog`: cadastra um usuario. Caminho "nova conta" (nome, e-mail, plano opcional) ou
    "vincular a loja existente" (codigo publico da loja); toggle "já liberar o acesso" aprova o
    login na hora ou deixa pendente de aprovacao.
  - `FichaContaDialog`: situacao, saude do WhatsApp, assinatura (so leitura), lojas (status do numero,
    nunca o numero, e o `codigo_publico` da loja, copiavel) e membros (papel + ref. opaca, sem contato).
  - Equipe Whaviso (`PainelEquipe`): lista de operadores, vincular usuario existente (id do Auth),
    trocar papel, desativar/reativar (ConfirmDialog). So admin: 403 vira "Só administradores".

## Dados
- Prefixo `/v1/plataforma-usuarios`: `GET /contas`, `GET /contas/:id`, `POST /usuarios`,
  `GET|POST /operadores`, `PATCH /operadores/:id`. Contratos: `@/shared/contracts/_generated/plataforma_usuarios`.
  `usePlanosAtivos` busca `/plataforma-cobranca/planos` direto (modulo nunca importa modulo).
- Cache raiz `['plataforma_usuarios']`. Rotas de operador: `semLoja: true` (sem `x-loja-id`).

## Privacidade
- Nada de conversa, pedido, cliente final, endereco ou contato (telefone/e-mail). Membro aparece so por
  papel e referencia curta do id.
- Suspender/reativar assinatura NAO mora aqui: e do modulo plataforma_cobranca.

## Primitivos locais
`AreaErro` (403 -> acesso restrito), `rotulos.ts` (situacao, saude, papeis).
