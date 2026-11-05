# numeros_whatsapp

## Proposito
Rotas da LOJA para o numero de WhatsApp (Embedded Signup da Meta): conectar, listar, detalhar,
pausar/reativar/remover e reconectar. E uma camada FINA de HTTP sobre o kernel compartilhado
`shared/numeros`, que detem a tabela, a regra de dominio, a cifra e a porta Meta. A loja efetiva
vem SEMPRE do escopo (`req.escopo.loja_ativa`), nunca do corpo/query (SEC-002).

## Entry points
- `index.ts` -> `numerosRoutes` (plugin Fastify registrado em `src/routes.ts`, prefixo `numeros`)
- `criarRotasNumeros(deps)` -> fabrica de teste (injeta `onboarding` stub + `cripto`)

## Especialistas consumidos
- `shared/numeros` (kernel): `servicoNumeros`, `depsDeProducao`, `DepsNumeros`, tipos de porta/cifra
- `shared/http_errors` (envelope de erro)
- `shared/auth` + `shared/tenant` (preHandlers `autenticar`/`escopoLoja`/`exigirPermissao`)
- `@whaviso/shared/contracts` (schemas via `./schemas`)

## Tabelas
- NAO e dono de tabela: quem detem `numeros_whatsapp` e o kernel `shared/numeros`. Este modulo
  nao acessa o banco direto; toda escrita/leitura passa pelo service do kernel.

## Segredo (token da Meta)
- O token (`token_cifrado`) e write-only e vive no kernel: nunca sai em resposta (SEC-020), log
  (SEC-024) nem persiste em claro. Aqui so logamos ids/estado.

## Env do onboarding (lidas em `shared/numeros/config.ts`)
- `META_APP_ID` / `META_APP_SECRET`: credenciais do app Meta (obrigatorias para conectar).
- `META_API_VERSION`: versao do Graph; DEFAULT `v23.0` (alinhada ao zap), validada contra
  `/^v\d+\.\d+$/` antes de entrar no path da URL (host sempre fixo `graph.facebook.com`, SEC-070).
- `META_REGISTER_PIN` (opcional): PIN de 6 digitos do passo `register` do Embedded Signup.
  - SEM a var (ou PIN invalido): o passo e PULADO, comportamento atual preservado.
  - COM PIN valido: apos assinar o webhook, o service tenta `POST /<phone_number_id>/register`
    em modo BEST-EFFORT. Qualquer falha (numero ja registrado, PIN errado, 4xx/5xx) e so logada
    (ids/estado, nunca token/pin/telefone) e a conexao do numero segue normalmente.

## Contratos
- publica (espelhar no front): `numeroConectarEntrada`, `numeroReconectarEntrada`,
  `numeroStatusEntrada`, `numeroSaida`, `listaNumerosSaida` (reexportados em `schemas.ts`)
- local: `numeroIdParam` (parametro de rota `:id`)

## Rotas (`/v1/numeros`)
- `POST /` conectar (dono/gerente; rate limit) · `GET /` listar · `GET /:id` detalhe
- `PATCH /:id/status` pausar|reativar|remover · `POST /:id/reconectar` rotacionar token (rate limit)

## Testes
- `numeros_whatsapp.test.ts`: integracao + seguranca das rotas da loja (SEC-001/002/020/022/023/024/031/101).
- A cifra e a porta Meta (kernel) sao testadas em `shared/numeros/cripto.test.ts`.
