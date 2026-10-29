# chaves_api

## Proposito
Chave de API por conta cliente, emitida pela Whaviso no console (ficha da conta). A chave e uma
credencial ALTERNATIVA ao JWT (`Authorization: Bearer whv_live_...`), tratada em `shared/auth`.

## Entry points
- `index.ts`: `chavesApiRoutes` (registry, prefixo `chaves-api`) e `criarChavesApiRoutes()` (teste).
- Rotas (`/v1/chaves-api`, so admin da plataforma): `GET /contas/:contaId/chaves`,
  `POST /contas/:contaId/chaves` (devolve o valor UMA vez), `POST /contas/:contaId/chaves/:id/revogar`.

## Invariantes
- Banco guarda so `prefixo`, `ultimos4` e `hash_sha256` (nunca o valor claro; nunca logado).
- Revogar e SOFT (`revogada_em`); sem DELETE (SEC-030). `expira_em` NULL = sem validade.
- Auth por chave: 401 se inexistente, revogada ou vencida. A chave autoriza so a conta dona; o
  principal e o dono da conta (vinculo ativo em `membros`); loja segue por `x-loja-id` validada
  pelo escopo (loja de outra conta = 404). Nunca vale em rota `acesso: 'plataforma'`.

## Tabelas
- escreve: `chaves_api` (INSERT/UPDATE), `eventos` (`plataforma.chave_api_criada|revogada`, sem segredo).
- le: `contas` (existencia).
