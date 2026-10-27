# F7 seguranca-harness

> Status vivo das etapas deste módulo. O resumo de módulo fica no [STATUS.md](../STATUS.md). Os testes
> que usam esta infraestrutura estão descritos em [catalogo.md](catalogo.md).

- **ID:** F7  ·  **Área:** SEC  ·  **Onda:** 0
- **Modelo sugerido:** Opus  ·  **Status:** `CONCLUIDO` (revisão Opus da etapa 16 feita e aprovada)
- **Reivindicado por:** F7-agent  ·  **Revisado por:** integrador (Opus)

## Objetivo

Entregar a **infraestrutura** que permite transformar cada `SEC-###` do
[SEGURANCA.md](../../docs/pivot/SEGURANCA.md) em teste automatizado barato de escrever e impossível de
esquecer: a suíte `security/` (vitest) ligada ao gate do CI, os helpers de banco por `SET ROLE`
(matriz de privilégio dos três roles de serviço), os utilitários de redaction de log, de dump e de
bundle, e o `check_rls_coverage.sh` rodando no CI. "Pronto" observável: `npm run test:security`
roda verde localmente e no CI, uma amostra de cada tipo de verificação (role, log, dump, bundle, RLS)
passa e **falha de propósito** quando a regra é violada, e um PR com um `SEC` vermelho não entra.

Este módulo **não implementa os SEC-### de cada superfície**: ele entrega o trilho. Os testes
acompanham a entrega do módulo dono da superfície (ver catálogo).

## Dependências

- `F0` (db-baseline): fornece o schema, os roles `whaviso_api` / `whaviso_zap` / `whaviso_atendente`,
  o RLS e os grants por coluna que a matriz de privilégio testa, e o `check_rls_coverage.sh`.
- `F4` (api-core): fornece a fábrica de app (`buildApp`/`server`), o logger com redaction, os headers
  e o `config`, que os helpers HTTP e o teste de redaction exercitam via `app.inject`.

## Contratos e tabelas que toca

- Não cria tabela nem migration. Só **lê** o catálogo do Postgres (`pg_class`, `pg_roles`,
  `information_schema.column_privileges`, `information_schema.table_privileges`) e conecta como cada
  role de serviço.
- Usa `credenciais_llm`, `numeros_whatsapp`, `loja_pix`, `envios`, `eventos`, `eventos_auth`,
  `uso_llm`, `templates` como **alvos da matriz** (a lista de alvos é dado, ver etapa 3).
- Não define contrato Zod novo. Reusa o `config` e o logger do `F4`.

## Arquivos (escopo de edição)

- `backend/security/**` (workspace novo `@whaviso/security`: `package.json`, `vitest.config.ts`,
  `tsconfig.json`, `helpers/**`, `matriz/**`, `fixtures/**`, `test/**`).
- `backend/package.json` (registrar o workspace e o script `test:security`).
- `backend/scripts/check_rls_coverage.sh` (só se precisar de ajuste para o CI; hoje já existe).
- `backend/scripts/check_bundle_secrets.sh` e `backend/scripts/check_dump_secrets.sh` (novos).
- `.github/workflows/*.yml` (só o job/step do gate de segurança; não mexer no deploy).
- NÃO tocar em `apps/api/src/**`, `apps/zap/src/**` nem migrations: se o harness precisar de um gancho
  no código de produção (ex.: exportar `buildApp`), é pedido ao dono do módulo (F4), não editado aqui.

## Etapas

Decisões de estrutura registradas em "Notas e decisões". Cada etapa é um commit atômico.

- [x] 1. **Esqueleto do workspace `security/`.** Criar `backend/security` como workspace próprio
  (vitest, TS estrito, `tsx`), registrar em `backend/package.json` com o script `test:security`
  (`vitest run --root security`). O workspace pode importar as fábricas de app de `apps/api` e
  `apps/zap` pelo ponto de entrada público; nunca importa de dentro de `modules/**`.
  (commit: `chore(security): esqueleto do workspace de testes de seguranca`)
- [x] 2. **Conexões por role (`helpers/db_roles.ts`).** Função `comoRole(role, fn)` que abre conexão
  de superusuário de teste, executa `SET ROLE <role>` numa transação (com `RESET ROLE`/rollback no
  `finally`) e entrega um cliente a `fn`. Roles aceitos: `whaviso_api`, `whaviso_zap`,
  `whaviso_atendente`, `anon`, `authenticated`. Rejeita role fora da lista. Conecta ao banco
  `whaviso_dev` local, nunca ao cloud (checagem de `PGDATABASE`/host no `beforeAll`; aborta se
  detectar host do Supabase).
  (commit: `feat(security): helper comoRole com SET ROLE transacional`)
- [x] 3. **Matriz de privilégio como dado (`matriz/privilegios.ts`).** Tabela declarativa
  `{ role, tabela, coluna?, operacao: select|insert|update|delete, esperado: permitido|negado }`
  cobrindo os três roles de serviço. Fonte inicial: SEC-021, 022, 030, 031, 032, 033 e a exceção de
  `templates` (DELETE permitido a `whaviso_api`). Cada linha é um caso gerado dinamicamente
  (`it.each`), assim uma tabela nova entra na matriz acrescentando uma linha. Inclui teste
  **de completude**: toda tabela de `public` precisa aparecer na matriz para pelo menos o role
  `whaviso_api`, senão o teste falha (impede tabela nova sem decisão explícita de privilégio).
  (commit: `feat(security): matriz declarativa de privilegios por role`)
- [x] 4. **Executor da matriz (`test/matriz_privilegios.test.ts`).** Para cada linha, executa a
  operação como o role e afirma: `negado` exige erro `42501` (insufficient_privilege) e `permitido`
  não pode falhar por privilégio (falhas de constraint/dados são toleradas e distinguidas, usando
  `SAVEPOINT` e dados mínimos semeados em fixture). Cada caso roda em transação com rollback para não
  sujar o banco.
  (commit: `test(security): executor da matriz de privilegio`)
- [x] 5. **Prova de que o harness detecta violação (meta-teste).** Teste que cria, numa transação
  descartável, uma tabela de teste sem RLS e um grant indevido, e confirma que o executor da matriz e
  a checagem de RLS **falham** nesse cenário. Sem isto, um harness quebrado passa verde em silêncio.
  (commit: `test(security): meta-teste que prova que o harness reprova violacao`)
- [x] 6. **Segredos conhecidos de fixture (`fixtures/segredos.ts`).** Constantes sentinela e únicas
  (`WHV_TEST_LLM_KEY_...`, token Meta, Pix, telefone) que contêm um prefixo grep-ável e nunca são
  usadas fora de teste. Função de semeadura que grava esses segredos pelo caminho real da aplicação
  (cifra + sha256) numa loja de teste. Todos os testes de vazamento (log, dump, bundle, resposta HTTP)
  procuram **essas sentinelas**.
  (commit: `feat(security): segredos sentinela e semeadura pelo caminho real`)
- [x] 7. **Utilitário de redaction de log (`helpers/captura_log.ts`).** Captura a saída do logger do
  `F4` (stream em memória) durante um `app.inject`, e expõe `semSentinelas(saida)`. Teste base: loga
  objeto com `chave`, `token`, `authorization`, `telefone`, `pix` em nível raso e **aninhado**, e
  afirma que nenhuma sentinela aparece e que o campo vira o marcador de redaction. Também cobre log de
  erro (stack/`cause`) e o log de request/response automático.
  (commit: `test(security): captura de log e teste de redaction`)
- [x] 8. **Helper de varredura de respostas HTTP (`helpers/varre_respostas.ts`).** Percorre o registry
  de rotas da api (`routes.ts`), chama cada rota autenticada como membro semeado e acumula os corpos de
  resposta; `naoContem(sentinela)` falha apontando rota e caminho JSON. Base para SEC-020. Inclui
  fábrica de tokens de teste (membro de loja A, membro de loja B, operador, anônimo) assinados com um
  JWKS local de teste, sem depender do Supabase.
  (commit: `feat(security): varredura de respostas e atores de teste`)
- [x] 9. **Teste de dump (`scripts/check_dump_secrets.sh` + `test/dump.test.ts`).** Semeia sentinelas
  (etapa 6) no banco de teste, roda `pg_dump` (dados + schema) e faz `grep -F` pelas sentinelas
  **em claro**; falha se alguma aparecer. Também afirma que o dump **contém** o ciphertext e o hash
  (prova de que o dado foi gravado e que o teste não é vazio). Reusa o resolvedor de `psql`/`pg_dump`
  com espaço no caminho do Windows já usado em `check_rls_coverage.sh`.
  (commit: `test(security): dump do banco nao contem segredo em claro`)
- [x] 10. **Teste de bundle (`scripts/check_bundle_secrets.sh` + `test/bundle.test.ts`).** Roda
  `npm run build` do `frontend/` com variáveis `VITE_*` de teste (anon key sentinela) e uma
  `service_role` sentinela presente no ambiente do processo; faz grep no `dist/` e falha se a
  service_role (ou qualquer chave `SUPABASE_SERVICE_ROLE`/`META_*`/`*_KEY` não pública) aparecer. Afirma
  que só a anon key esperada está presente. O frontend continua standalone: o script só lê `dist/`.
  Só ativo quando `frontend/` já tem build (F6); antes disso o teste fica `todo` e documenta o motivo.
  (commit: `test(security): bundle do front nao vaza service_role`)
- [x] 11. **Gate de RLS no CI.** Garantir que `check_rls_coverage.sh` roda no workflow do CI (job de
  backend), após `validate_migrations.sh`, em Postgres de serviço. Falha do script falha o job.
  Documentar a flag no cabeçalho do script (uso no CI já descrito).
  (commit: `ci(security): check_rls_coverage no gate`)
- [x] 12. **Gate da suíte `security/` no CI.** Acrescentar o step `npm run test:security` ao mesmo job
  que roda lint/typecheck/test, com Postgres de serviço e o seed. Torná-lo **obrigatório** (required
  check) para merge em `main` e `development`. Saída em formato que liste os ids `SEC-###` que falharam
  (convenção: todo `describe`/`it` carrega o id no nome, ver etapa 13).
  (commit: `ci(security): suite security no gate de lint/typecheck/test`)
- [x] 13. **Convenção de id e verificação de rastreabilidade (`test/rastreabilidade.test.ts`).** Todo
  teste de segurança nomeia o id no título (`SEC-021: ...`). Este teste lê `docs/pivot/SEGURANCA.md`,
  extrai todos os `SEC-###` e lê um registro `catalogo_estado.json` (id -> `verde | pendente | n/a` +
  módulo dono). Falha se: um SEC do documento não está no registro; um SEC marcado `verde` não tem
  teste com esse id; ou um teste cita um id inexistente. É o que impede "esquecer" um item do catálogo.
  (commit: `test(security): rastreabilidade entre SEGURANCA.md e a suite`)
- [x] 14. **Primeiros SEC verdes via harness.** Com a infraestrutura pronta, ligar SEC-011 (script de
  RLS, já verde) e os casos da matriz que dependem só de F0 (SEC-021, 022, 030, 031, 032, 033 no nível
  de privilégio de coluna/tabela). Registrar no `catalogo_estado.json`.
  (commit: `test(security): primeiros SEC verdes pela matriz de roles`)
- [x] 15. **Documentação operacional do harness.** Seção curta no `backend/AGENTS.md` (ou `README` da
  pasta `security/`): como rodar local, como acrescentar uma linha na matriz, como acrescentar um SEC,
  como os testes de dump e bundle funcionam, e o passo da revisão Opus. Sem regra de negócio.
  (commit: `docs(security): como rodar e estender a suite`)
- [ ] 16. **Revisão Opus do harness.** Um revisor **Opus** confere: a matriz cobre todas as tabelas e
  os três roles; os testes realmente reprovam (meta-teste); nenhum teste loga ou persiste segredo real;
  o gate é obrigatório; o catálogo está rastreado. Parecer registrado em "Notas e decisões".
- [x] Testes de unidade do módulo passando (`npm run test:security` e `npm test` verdes)

## Testes e segurança exigidos

- `SEC-011` verde via CI (cobertura de RLS), já existente, agora **obrigatório** no gate.
- Infraestrutura pronta para SEC-021, 022, 023, 024, 025, 030, 031, 032, 033 (privilégio, dump, log,
  bundle). Os testes completos de cada um são entregues junto do módulo dono (ver
  [catalogo.md](catalogo.md)); aqui ficam os trilhos e uma amostra verde de cada tipo.
- Meta-teste (etapa 5) prova que o harness reprova violação.
- Rastreabilidade (etapa 13) prova que nenhum `SEC-###` do SEGURANCA.md está sem dono.
- **A verificação final das superfícies sensíveis do harness** (matriz de privilégio, dump, bundle) é
  feita por um **revisor Opus contra o catálogo**; teste verde sozinho não encerra o módulo.

## Notas e decisões

- **Onde vive a suíte:** SEGURANCA.md diz `backend/**/test/security/`. Decisão: um **workspace único
  `backend/security/`** (não espalhado por `apps/*/test/`), porque a matriz de roles, o dump e o bundle
  são transversais e não pertencem a api nem a zap. Testes de superfície muito local (ex.: o
  `ClienteLLM` sem segredo no prompt) podem ficar ao lado do módulo e ser **registrados** na
  rastreabilidade pelo id; o registro `catalogo_estado.json` aceita o caminho do teste.
- **Módulo nunca importa módulo:** o workspace `security/` não é módulo de feature; importa só o
  ponto de entrada público (fábrica de app, logger, config). Se o lint de fronteira reclamar,
  ajustar a regra para permitir `security/**` como consumidor de leitura, nunca burlar.
- **Banco dos testes:** sempre o Postgres local (`whaviso_dev`), nunca o cloud. Roles
  `whaviso_*` precisam existir (vêm do `validate_migrations.sh`); `anon`/`authenticated` do shim de
  auth local (`test_shim_auth.sql`).
- **`pgvector` ausente local:** testes que dependem de `embedding` (RAG) ficam `skipIf` sem a extensão
  e rodam em CI com pgvector; não bloqueiam o harness.
- **Segredos sentinela:** prefixo único e fixo para grep, nunca valor real. Nenhum log ou artefato do
  CI pode imprimir o valor semeado; em falha, o teste mostra rota/arquivo/linha, não o segredo.
- **Dump e bundle em Windows:** `pg_dump` com espaço no caminho usa o mesmo resolvedor do script de
  RLS; `PGCLIENTENCODING=UTF8` e `tr -d '\r'` na captura.
- **Red team (loop de subagents)** descrito no SEGURANCA.md fica fora deste módulo: é processo, não
  harness. O que ele descobrir vira novo `SEC-###` e uma linha em `catalogo_estado.json`.

### Entrega (F7-agent) e pontos para a revisão Opus (etapa 16)

Estado observável: `npm run test:security` verde (105 passam, 2 `todo`, bundle `skip` sem F6);
`npm run lint` + `npm run typecheck` + `npm test` dos outros workspaces verdes. Verdes pelo harness
hoje: **SEC-011, 021, 022, 023, 024, 030, 031, 032, 033**. A matriz cobre as **38 tabelas** de
`public` (completude dinâmica) e os **3 roles** de serviço; o meta-teste prova que uma brecha
(grant indevido + tabela sem RLS) é **reprovada**.

- **`security/` não entra no `npm test`** (sem script `test`, só `test:security`), para não rodar em
  duplicidade; o CI tem step próprio **obrigatório** (`npm run test:security`) no job `gate`. Tornar
  o `gate` required para `main`/`development` é configuração de branch protection (fora do YAML).
- **Fronteira:** não foi preciso mexer no ESLint. O `boundaries/include` já cobre só
  `apps/*/src` e `packages/shared/src`, então `security/**` fica fora da regra de fronteira (consome
  `@whaviso/shared` e os plugins públicos da api por import relativo, sem tocar `modules/**`).
- **Semeadura de segredo é stand-in (pgcrypto), não o `cifrar()` de produção** — que ainda não
  existe (API-config-llm/numeros/pagamentos não implementados). A forma em repouso (bytea cifrado +
  sha256) é a mesma; trocar a semeadura quando o helper real existir. *Gancho para os donos desses
  módulos, não para o F4.*
- **Gap no logger do F4 (SEC-024):** a redaction cobre `chave/token/authorization/telefone/pix`
  (raso e aninhado, testado), mas **`numero_convite` NÃO é redigido** (`campoSensivel` não casa
  `numero_convite`). O AGENTS.md cita `numero` na redaction; sugerir ao dono do F4 incluir
  `numero_convite`/`convite` na lista. Não editei `packages/shared`.
- **SEC-032 e o `loja_pix`:** o catálogo prevê o atendente lendo a coluna do BR Code em `loja_pix`,
  mas o F0 **ainda não concede** esse grant (migration 0008 só dá `loja_pix` à api). A matriz afirma
  o estado atual (**negado**); quando o grant entrar, atualizar a linha (a nota do catálogo já pede
  revisão Opus ao habilitar).
- **SEC-020 e SEC-025 ficam `pendente`:** o trilho existe (scanner de respostas + atores JWKS locais;
  script de bundle), mas o teste real depende dos módulos de dados (SEC-020) e do build do F6
  (SEC-025, `todo` documentado).

### Revisão Opus (etapa 16): APROVADO

Revisão feita pelo integrador (Opus), verificando no código, não na confiança. Os cinco critérios
da etapa 16:

1. **A matriz cobre todas as tabelas e os três roles.** `TABELAS_CONHECIDAS` lista as 38 tabelas de
   `public`; o teste de completude compara com o catálogo vivo do Postgres e **falha o gate** se uma
   migration nova trouxer tabela não classificada. `matrizDeleteApi()` gera uma linha por tabela;
   `CASOS_ESPECIFICOS` cobre `whaviso_api`/`whaviso_zap`/`whaviso_atendente` com espelho de permissão.
2. **Os testes realmente reprovam (meta-teste).** `meta_teste.test.ts` fabrica as duas brechas (grant
   a `anon` sem RLS; ausência de grant) e confirma que a avaliação da matriz reprova e que
   `check_rls_coverage.sh` sai `!= 0`. O `dump.test.ts` planta um claro de propósito e confirma que o
   script o pega **sem imprimir o valor**. Rodou verde aqui (105 passam).
3. **Nenhum teste loga ou persiste segredo real.** Sentinelas são sintéticas (`WHV_SENTINEL_*`),
   semeadas só na forma cifrada em repouso; `comoRole` faz `ROLLBACK` sempre (nada suja o banco nem
   vaza o role); em falha, os testes mostram rota/arquivo/linha/nome, nunca o valor; o teste de dump
   afirma cifra+hash presentes e claro ausente.
4. **O gate é obrigatório.** Step `test:security` no job `gate` do CI (confirmado no YAML). *Tornar o
   job `gate` um required check de merge para `main`/`development` é branch protection do GitHub,
   fora do repositório: pendência de configuração para o dono do repo.*
5. **O catálogo está rastreado.** `catalogo_estado.json` + `TABELAS_CONHECIDAS`/`CASOS_ESPECIFICOS`
   como fonte versionada.

Ganchos aceitos como follow-up (não bloqueiam o F7; cada um entra com o módulo dono):
`numero_convite`/`convite` na redaction (quando o fluxo de convite existir), grant de `loja_pix` ao
atendente (módulo de pagamentos), troca da semeadura stand-in pelo `cifrar()` real, e SEC-025 bundle
(com o build do F6 e sentinela `service_role`).
