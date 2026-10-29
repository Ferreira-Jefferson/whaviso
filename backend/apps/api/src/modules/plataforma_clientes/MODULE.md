# plataforma_clientes

## Proposito
Console do operador (equipe Whaviso): restaurantes como clientes. Lista/busca contas, ficha da conta
(lojas, membros sem contato, saude do numero WhatsApp, ultima assinatura) e gestao da equipe
(`operadores`, so admin). Somente metadado: nunca conteudo de loja (SEC-003).

## Entry points
- `index.ts`: `plataformaClientesRoutes` (registry) e `criarPlataformaClientesRoutes()` (teste).
- Rotas (`/v1/plataforma-clientes`): `GET /contas`, `GET /contas/:id`, `GET /operadores` (admin),
  `POST /operadores` (admin, por e-mail), `PATCH /operadores/:id` (admin), `POST /contas` (admin,
  provisiona cliente: conta + loja + dono, dono resolvido por e-mail).

## Escopo / permissoes
- Toda rota: `config.acesso = 'plataforma'` + `preHandler [autenticar, escopoOperador]`. Membro de
  loja recebe 403 (nao e operador ativo). Escritas e listagem da equipe: + `exigirAdmin` (papel do
  `req.operador`). O alvo vem sempre de `params`; nada de `loja_id`/`conta_id` no corpo/query (strict).

## Tabelas
- escreve: `operadores` (sem DELETE: `ativo=false`), `contas`/`lojas`/`membros` (so INSERT, no provisionamento de cliente), `eventos` (`plataforma.operador_criado|alterado`,
  ator `operador`, `detalhes` so com ids/papeis).
- le (colunas explicitas): `contas`, `lojas`, `membros` (papel/ids, sem contato), `numeros_whatsapp`
  (somente status/verificado/criado_em), `assinaturas`.
- PROIBIDAS (guarda estatica em `escopo.test.ts`): pedidos, itens_pedido*, conversas, mensagens,
  clientes, enderecos, pagamentos, loja_pix, credenciais_llm, uso_llm, base_conhecimento,
  cache_semantico, motoboys*, envios.

## Invariantes
- Sempre resta >= 1 admin ativo (admins travados `for update` na transacao); ninguem se autopromove.
- Convite de operador e provisionamento de cliente resolvem o `user_id` por e-mail no Auth via funcoes
  SECURITY DEFINER (migration 0069: `plataforma_user_id_por_email`, `plataforma_auth_info`); e-mail
  desconhecido -> 422 `usuario_sem_acesso`. Dono que ja pertence a uma conta -> 409 `ja_possui_conta`.
- Busca ILIKE parametrizada, min. 2 caracteres, `%`/`_`/`\` escapados. Paginacao por cursor
  (`criado_em`, `id`).
- Acoes de suspender/reativar assinatura NAO moram aqui (P-cobranca).

## Contratos
- `packages/shared/src/contracts/plataforma_clientes/index.ts` (reexportados por `schemas.ts`).
