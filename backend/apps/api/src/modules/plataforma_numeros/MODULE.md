# plataforma_numeros

## Proposito
Rotas do CONSOLE do operador para gerir os numeros de WhatsApp de QUALQUER loja: conectar, listar,
detalhar, pausar/reativar/remover e reconectar. Camada FINA de HTTP sobre o kernel compartilhado
`shared/numeros` (dono da tabela, da regra de dominio, da cifra e da porta Meta). O operador e
global por desenho; nao ha isolamento por tenant, mas ha grade de permissao de console.

## Entry points
- `index.ts` -> `plataformaNumerosRoutes` (registrado em `src/routes.ts`, prefixo `plataforma-numeros`)
- `criarRotasPlataformaNumeros(deps)` -> fabrica de teste (injeta `onboarding` stub + `cripto`)

## Especialistas consumidos
- `shared/numeros` (kernel): `servicoNumeros`, `depsDeProducao`, `DepsNumeros`
- `shared/auth` + `shared/operador` + `shared/tenant` (`autenticar`/`escopoOperador`/`exigirPermissao`)
- `@whaviso/shared/contracts` (contratos de numero, via `./schemas`)

## Tabelas
- NAO e dono de tabela. Toda leitura/escrita de `numeros_whatsapp` (e a verificacao de existencia
  de `lojas`) passa pelo kernel `shared/numeros`. Nenhum acesso direto ao banco aqui.

## Escopo e seguranca
- Toda rota: `config.acesso: 'plataforma'` + `preHandler [autenticar, escopoOperador, exigirPermissao(...)]`.
  Leitura -> `numeros_plataforma:ver`; escrita -> `numeros_plataforma:gerir`.
- Bloqueio-por-padrao (SEC-003): rota de conteudo de loja continua negada ao operador; membro de
  loja recebe 403 do `escopoOperador`.
- A loja alvo vem SEMPRE de params (`:lojaId`) ou e resolvida do numero (`:id`), nunca do corpo/query
  (SEC-002). Loja inexistente / numero inexistente -> 404.
- Segredo (SEC-020/023/024): o token continua write-only no kernel; nunca sai em resposta nem log.

## Contratos
- reusa os contratos publicos do numero (`numeroConectarEntrada`, `numeroReconectarEntrada`,
  `numeroStatusEntrada`, `numeroSaida`, `listaNumerosSaida`); nenhum contrato novo.
- local: `lojaIdParam` (`:lojaId`), `numeroIdParam` (`:id`).

## Rotas (`/v1/plataforma-numeros`)
- `GET  /lojas/:lojaId/numeros`    listar (ver)
- `POST /lojas/:lojaId/numeros`    conectar (gerir; rate limit)
- `GET  /numeros/:id`              detalhe (ver)
- `PATCH /numeros/:id/status`      pausar|reativar|remover (gerir)
- `POST /numeros/:id/reconectar`   rotacionar token (gerir; rate limit)

## Testes
- `plataforma_numeros.test.ts`: integracao + seguranca (operador gere numero de qualquer loja por
  params; token nunca em resposta/log; SEC-003 nao regride; loja/numero inexistente -> 404;
  permissao `:ver` vs `:gerir`).
