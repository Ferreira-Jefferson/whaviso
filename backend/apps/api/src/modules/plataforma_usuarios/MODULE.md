# plataforma_usuarios

## Proposito
Console do operador (equipe Whaviso): cadastro de usuarios do Whaviso (dono de restaurante, membro
de uma loja ja cadastrada, ou equipe interna da Whaviso) e o console de contas (restaurantes).
Lista/busca contas, ficha da conta (lojas com codigo publico, membros sem contato, saude do numero
WhatsApp, ultima assinatura) e gestao da equipe (`operadores`, so admin). Somente metadado: nunca
conteudo de loja (SEC-003).

## Entry points
- `index.ts`: `plataformaUsuariosRoutes` (registry) e `criarPlataformaUsuariosRoutes()` (teste).
- Rotas (`/v1/plataforma-usuarios`): `GET /contas`, `GET /contas/:id`, `GET /operadores` (admin),
  `POST /operadores` (admin, por e-mail), `PATCH /operadores/:id` (admin), `POST /usuarios` (admin,
  cadastra um usuario: vincula a uma loja ja cadastrada via `loja_codigo_publico`, ou cria conta
  nova, com `plano_id` opcional; `ativo` aprova o acesso de login na hora ou deixa pendente).

## Escopo / permissoes
- Toda rota: `config.acesso = 'plataforma'` + `preHandler [autenticar, escopoOperador]`. Membro de
  loja recebe 403 (nao e operador ativo). Escritas e listagem da equipe: + `exigirAdmin` (papel do
  `req.operador`). O alvo vem sempre de `params`; nada de `loja_id`/`conta_id` no corpo/query (strict).

## Tabelas
- escreve: `operadores` (sem DELETE: `ativo=false`), `contas`/`lojas`/`membros`/`assinaturas` (so
  INSERT, no cadastro de usuario), `acessos_permitidos` (so via helper compartilhado
  `shared/emails_outbox.definirAcessoAdmin`, nao escreve direto), `eventos`
  (`plataforma.operador_criado|alterado`, `plataforma.usuario_provisionado`,
  `plataforma.usuario_vinculado_loja`, ator `operador`, `detalhes` so com ids/papeis).
- le (colunas explicitas): `contas`, `lojas` (incl. `codigo_publico`), `membros` (papel/ids, sem
  contato), `numeros_whatsapp` (somente status/verificado/criado_em), `assinaturas`, `planos`
  (so para validar `plano_id`).
- PROIBIDAS (guarda estatica em `escopo.test.ts`): pedidos, itens_pedido*, conversas, mensagens,
  clientes, enderecos, pagamentos, loja_pix, credenciais_llm, uso_llm, base_conhecimento,
  cache_semantico, motoboys*, envios.

## Invariantes
- Sempre resta >= 1 admin ativo (admins travados `for update` na transacao); ninguem se autopromove.
- Convite de operador e cadastro de usuario vinculado a loja existente resolvem o `user_id` por
  e-mail no Auth via funcoes SECURITY DEFINER (migration 0069: `plataforma_user_id_por_email`,
  `plataforma_auth_info`); e-mail desconhecido -> 422 `usuario_sem_acesso`. Dono/membro que ja
  pertence a uma conta -> 409 `ja_possui_conta`.
- Cadastro de usuario SEM `loja_codigo_publico` e SEM o e-mail ter acessado antes: cria a conta sem
  dono (`dono_user_id null`) e sem loja; o vinculo do dono e a criacao da loja acontecem depois,
  no primeiro login (bootstrap do modulo `conta`) e via `POST /v1/lojas` pelo proprio dono.
- `ativo` no cadastro de usuario so controla a allowlist de login (`acessos_permitidos`), conferida
  pelo shell em toda sessao (nao so no bootstrap) — nao mexe em `membros.ativo`.
- `lojas.codigo_publico`: identificador curto e unico (migration 0095), gerado por default no
  banco. Hoje serve para localizar a loja no cadastro de usuario; mais pra frente vira o link do
  cardapio virtual (ainda nao existe).
- Busca ILIKE parametrizada, min. 2 caracteres, `%`/`_`/`\` escapados. Paginacao por cursor
  (`criado_em`, `id`).
- Acoes de suspender/reativar assinatura NAO moram aqui (P-cobranca).

## Contratos
- `packages/shared/src/contracts/plataforma_usuarios.ts` (reexportados por `schemas.ts`).
