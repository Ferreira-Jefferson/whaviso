# numeros_whatsapp

## Proposito
Cadastro do numero de WhatsApp da loja via Embedded Signup da Meta. Troca o `code` por token,
persiste `phone_number_id`/`waba_id`, `numero_hash` (sha256) e `token_cifrado` (AES-256-GCM),
e expoe o estado `conectado`/`pausado`/`removido`. Segredo: o token (write-only para a api).

## Entry points
- `index.ts` -> `numerosRoutes` (plugin Fastify registrado em `src/routes.ts`, prefixo `numeros`)

## Especialistas consumidos
- `@whaviso/shared/db` (consultar/sql: unica via de dados)
- `@whaviso/shared/contracts` (`statusNumero`)
- `shared/http_errors` (envelope de erro), `shared/tokens` (`sha256Hex`)
- `shared/auth` + `shared/tenant` (preHandlers `autenticar`/`escopoLoja`/`exigirPermissao`)

## Tabelas
- dono de: `numeros_whatsapp` (insert/update completos; `token_cifrado` nunca sai em SELECT de leitura)
- le de: `lojas`/`membros` via kernel de escopo (nao direto)

## Segredo (token da Meta)
- `token_cifrado` e WRITE-ONLY na pratica da api: o repo so projeta colunas publicas; o claro
  nunca volta em resposta (SEC-020), log (SEC-024) nem persiste.
- A cifra (`cripto.ts`) delega ao kernel `@whaviso/shared/cifra`: so adapta token string <-> Buffer.
  O `zap` (role `whaviso_zap`) decifra `token_cifrado` com a MESMA `MASTER_KEY` via o mesmo kernel.
- Porta Meta (`meta_onboarding.ts`): host fixo `graph.facebook.com`, sem redirect (SEC-070).
  Promover para `shared/meta_onboarding/**` quando F2 definir o contrato comum.

## Contratos
- publica (espelhar no front): `numeroConectarEntrada`, `numeroReconectarEntrada`,
  `numeroStatusEntrada`, `numeroSaida`, `listaNumerosSaida` (schemas.ts)

## Rotas (`/v1/numeros`)
- `POST /` conectar (dono/gerente; rate limit) · `GET /` listar · `GET /:id` detalhe
- `PATCH /:id/status` pausar|reativar|remover · `POST /:id/reconectar` rotacionar token (rate limit)

## Config de producao
- `MASTER_KEY` (envApiSchema, ja existe) deriva a chave AES no kernel `@whaviso/shared/cifra`
  (sha256 com separacao de dominio). `META_APP_ID`/
  `META_APP_SECRET` lidos de `process.env` em `config.ts` (propor promover ao envApiSchema).
