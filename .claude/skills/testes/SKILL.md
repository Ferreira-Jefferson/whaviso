---
name: testes
description: "Como rodar e como escrever testes no whaviso (backend com vitest + Postgres local). Cobre o loop rapido (so o que mudou), a suite cheia, o gate antes do commit, e o padrao obrigatorio de teste de integracao (banco por worker, pools via test-support, isolamento por cenario). Use quando o usuario pedir para rodar/escrever/ajustar testes, falar que a suite esta lenta, criar teste de modulo, ou perguntar como testar algo no backend. Gatilhos: rodar testes, teste lento, escrever teste, teste de integracao, vitest, test:changed, gate, bateria de testes."
---

# testes

Forma unica de rodar e escrever testes no backend do whaviso. A infra de teste e
centralizada em [backend/test-support/](../../../backend/test-support/README.md): nenhum
workspace ou modulo monta pool, nome de banco ou config de vitest por conta propria. Esta
skill e o roteiro; o README do test-support e a referencia da mecanica.

Regra de ouro: **nao reinvente**. Pool sai de `criarPool`/`criarPoolSuper`; config sai de
`configBackend`. Nunca monte `new pg.Pool` nem leia `process.env.PGDATABASE` num teste.

## Executar

Rode de dentro de `backend/`. O banco base `whaviso_dev` precisa existir, migrado e semeado
(`bash scripts/validate_migrations.sh whaviso_dev`); sem Postgres local, os testes de banco se
pulam sozinhos.

| Objetivo | Comando |
|---|---|
| Loop rapido: so os testes ligados ao que voce mudou | `npm run test:changed` |
| Um modulo | `cd apps/api && npx vitest run src/modules/<mod>` |
| Um workspace inteiro | `cd apps/<ws> && npx vitest run` |
| Suite cheia (api+zap+atendente+shared) | `npm test` |
| Seguranca (trilho separado) | `npm run test:security` |
| Gate completo antes do commit | `npm run lint && npm run typecheck && npm test && npm run test:security` |

Ajuste de paralelismo: o numero de workers (= de bancos-clone) e automatico por CPU, com teto.
Para medir ou fixar: `VITEST_MAX_FORKS=<n> npx vitest run`.

No dia a dia use `test:changed`; rode a suite cheia antes de commitar. O CI roda tudo sempre;
a selecao e so para o ciclo local.

## Como o isolamento funciona (por que da para paralelizar)

Cada worker do vitest recebe um clone proprio do banco (`whaviso_dev_<escopo>_w<id>`), criado em
`global-setup.ts` via `CREATE DATABASE ... TEMPLATE`. Arquivos em workers distintos usam bancos
distintos; arquivos no mesmo worker rodam em serie no tempo. Logo o paralelismo entre arquivos e
seguro inclusive com advisory locks (chaveados por entidade) e testes de corrida.

## Escrever um teste

Decida primeiro o tipo:

- **Puro / unitario** (sem banco): funcao de dominio, calculo, validacao, resolvedor. Fica em
  `src/modules/<mod>/<nome>.test.ts` e nao importa pool nem harness. E o teste mais rapido;
  prefira-o sempre que a logica nao exigir o banco.
- **Integracao** (com banco): exercita rota/repo contra o Postgres real sob o role de servico.

### Padrao de teste de integracao (obrigatorio)

1. Pools SEMPRE da fabrica compartilhada, nunca na mao:
   ```ts
   import { criarPool, criarPoolSuper } from '../../../test-support/banco'
   const poolApi = criarPool('whaviso_api', 'whaviso_api_dev')
   const poolSuper = criarPoolSuper()
   ```
   (`poolSuper` semeia o que exige FK/privilegio; o pool do role roda o codigo sob o privilegio real.)
2. Pule a suite se o banco nao responde, nunca quebre:
   ```ts
   const online = await bancoAcessivel()
   const d = online ? describe : describe.skip
   ```
3. Isole por **cenario com ids aleatorios** (`randomUUID`), uma conta/loja nova por teste. Nao
   dependa de ids fixos nem de estado deixado por outro teste. Limpe o que o cenario criou no
   `afterAll` (ou `afterEach`), em cascata pela conta. Nunca `TRUNCATE` global.
4. Prefira semear o minimo. Reuse o harness do modulo quando existir (`src/modules/<mod>/tests/`).

### Regras que, se furadas, dao bug ou flakiness

- **Teste de corrida fica num arquivo so.** A concorrencia e dentro do teste (varias conexoes ao
  mesmo banco do worker); nao espalhe entre arquivos.
- **pg_dump e SET ROLE nao paralelizam.** Suites assim (seguranca) rodam em serie no banco base:
  a config usa `configBackend('<escopo>', { comBanco: false })`. Nao ligue banco por worker nelas.
- **Nao logue dado sensivel** (telefone, Pix, token) nem no teste.
- **Nao importe modulo de modulo** nem no teste; cruze por contrato/banco. O bootstrap do app no
  teste pode cruzar fronteiras (o lint ja isenta `*.test.ts`).

## Config de um novo workspace de teste

So chame o factory, nada de copiar config:
```ts
import { configBackend } from '../../test-support/vitest-backend'
export default configBackend('<escopo>')               // com banco por worker + paralelismo
// ou, para suites seriais (pg_dump/SET ROLE):
export default configBackend('<escopo>', { comBanco: false, testTimeout: 30_000 })
```

## Verificar antes de concluir

Teste nao esta pronto so por existir: rode o comando e mostre o resultado. Trabalho concluido e
verificado (gate verde) e commitado imediatamente, de forma atomica, por modulo.
