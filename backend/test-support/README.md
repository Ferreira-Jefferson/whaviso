# test-support (infra de teste do backend)

Dono unico da forma de rodar e configurar os testes do backend. Nenhum workspace ou
modulo monta pool, nome de banco ou config de vitest por conta propria: tudo passa por aqui.
(Frontend tem o seu equivalente dentro de `frontend/`; teste de integracao cross-escopo
mora na raiz do repo.)

## Arquivos

- `vitest-backend.ts` -> `configBackend()`: a config base. Cada `vitest.config.ts` de
  workspace e so `export default configBackend({...})`. Centraliza carga de `.env.test`/`.env`,
  `pool: 'forks'`, paralelismo entre arquivos, `maxForks` e os setupFiles de banco.
- `banco.ts`: `criarPool(role, senha)`, `criarPoolSuper()`, `bancoDoWorker()`. Todo pool de
  teste sai daqui, apontando para o banco do worker atual.
- `global-setup.ts`: roda uma vez antes dos workers. Clona o banco de teste em um por worker
  (`<base>_<escopo>_w<id>`, ex.: `whaviso_dev_api_w3`) via `CREATE DATABASE ... TEMPLATE`. O
  escopo (nome do workspace, passado em `configBackend('api')`) isola os bancos entre
  workspaces: o gate roda um apos o outro e nunca dropa o banco que o outro usa.
- `setup-banco.ts`: roda em cada worker antes dos arquivos. Fixa `PGDATABASE` no clone do worker.

## Por que banco por worker

O gargalo da suite era a coleta de modulos em serie (`fileParallelism: false`). Paralelizar
arquivos exige que arquivos concorrentes nao disputem o mesmo Postgres. Cada worker do vitest
recebe um clone proprio do banco; arquivos em workers distintos usam bancos distintos, e
arquivos no mesmo worker rodam em serie no tempo. Logo o paralelismo e seguro inclusive para
advisory locks (chaveados por entidade) e testes de corrida (confinados a um arquivo).

## Como usar num teste de modulo

```ts
import { criarPool, criarPoolSuper } from '../../../test-support/banco'
const poolApi = criarPool('whaviso_api', 'whaviso_api_dev')
const poolSuper = criarPoolSuper()
```

Nao leia `process.env.PGDATABASE` nem monte connection string na mao: use `criarPool`.

## Ajustar o numero de workers

O numero de workers (= de bancos-clone) e automatico por CPU, com teto (ver `NUM_WORKERS`
em `banco.ts`): em CI de 2 cores vira 2, numa maquina de muitos cores bate o teto. Mais
workers paralelizam mais, mas cada um custa conexoes e um clone no boot, e acima de certo
ponto rende menos. `VITEST_MAX_FORKS=<n>` sobrepoe para medir ou fixar.

## Pre-requisito

O banco base (`whaviso_dev`, via `PGDATABASE` de `.env.test`) precisa existir, migrado e
semeado (`scripts/validate_migrations.sh`). Sem Postgres local, o global-setup avisa e segue,
e as suites de DB se pulam sozinhas.
