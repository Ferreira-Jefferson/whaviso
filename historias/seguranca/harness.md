# F7 seguranca-harness

> Status vivo das etapas deste módulo. O resumo de módulo fica no [STATUS.md](../STATUS.md). Os testes
> que usam esta infraestrutura estão descritos em [catalogo.md](catalogo.md).

- **ID:** F7  ·  **Área:** SEC  ·  **Onda:** 0
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (preencher ao começar)

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

- [ ] 1. **Esqueleto do workspace `security/`.** Criar `backend/security` como workspace próprio
  (vitest, TS estrito, `tsx`), registrar em `backend/package.json` com o script `test:security`
  (`vitest run --root security`). O workspace pode importar as fábricas de app de `apps/api` e
  `apps/zap` pelo ponto de entrada público; nunca importa de dentro de `modules/**`.
  (commit: `chore(security): esqueleto do workspace de testes de seguranca`)
- [ ] 2. **Conexões por role (`helpers/db_roles.ts`).** Função `comoRole(role, fn)` que abre conexão
  de superusuário de teste, executa `SET ROLE <role>` numa transação (com `RESET ROLE`/rollback no
  `finally`) e entrega um cliente a `fn`. Roles aceitos: `whaviso_api`, `whaviso_zap`,
  `whaviso_atendente`, `anon`, `authenticated`. Rejeita role fora da lista. Conecta ao banco
  `whaviso_dev` local, nunca ao cloud (checagem de `PGDATABASE`/host no `beforeAll`; aborta se
  detectar host do Supabase).
  (commit: `feat(security): helper comoRole com SET ROLE transacional`)
- [ ] 3. **Matriz de privilégio como dado (`matriz/privilegios.ts`).** Tabela declarativa
  `{ role, tabela, coluna?, operacao: select|insert|update|delete, esperado: permitido|negado }`
  cobrindo os três roles de serviço. Fonte inicial: SEC-021, 022, 030, 031, 032, 033 e a exceção de
  `templates` (DELETE permitido a `whaviso_api`). Cada linha é um caso gerado dinamicamente
  (`it.each`), assim uma tabela nova entra na matriz acrescentando uma linha. Inclui teste
  **de completude**: toda tabela de `public` precisa aparecer na matriz para pelo menos o role
  `whaviso_api`, senão o teste falha (impede tabela nova sem decisão explícita de privilégio).
  (commit: `feat(security): matriz declarativa de privilegios por role`)
- [ ] 4. **Executor da matriz (`test/matriz_privilegios.test.ts`).** Para cada linha, executa a
  operação como o role e afirma: `negado` exige erro `42501` (insufficient_privilege) e `permitido`
  não pode falhar por privilégio (falhas de constraint/dados são toleradas e distinguidas, usando
  `SAVEPOINT` e dados mínimos semeados em fixture). Cada caso roda em transação com rollback para não
  sujar o banco.
  (commit: `test(security): executor da matriz de privilegio`)
- [ ] 5. **Prova de que o harness detecta violação (meta-teste).** Teste que cria, numa transação
  descartável, uma tabela de teste sem RLS e um grant indevido, e confirma que o executor da matriz e
  a checagem de RLS **falham** nesse cenário. Sem isto, um harness quebrado passa verde em silêncio.
  (commit: `test(security): meta-teste que prova que o harness reprova violacao`)
- [ ] 6. **Segredos conhecidos de fixture (`fixtures/segredos.ts`).** Constantes sentinela e únicas
  (`WHV_TEST_LLM_KEY_...`, token Meta, Pix, telefone) que contêm um prefixo grep-ável e nunca são
  usadas fora de teste. Função de semeadura que grava esses segredos pelo caminho real da aplicação
  (cifra + sha256) numa loja de teste. Todos os testes de vazamento (log, dump, bundle, resposta HTTP)
  procuram **essas sentinelas**.
  (commit: `feat(security): segredos sentinela e semeadura pelo caminho real`)
- [ ] 7. **Utilitário de redaction de log (`helpers/captura_log.ts`).** Captura a saída do logger do
  `F4` (stream em memória) durante um `app.inject`, e expõe `semSentinelas(saida)`. Teste base: loga
  objeto com `chave`, `token`, `authorization`, `telefone`, `pix` em nível raso e **aninhado**, e
  afirma que nenhuma sentinela aparece e que o campo vira o marcador de redaction. Também cobre log de
  erro (stack/`cause`) e o log de request/response automático.
  (commit: `test(security): captura de log e teste de redaction`)
- [ ] 8. **Helper de varredura de respostas HTTP (`helpers/varre_respostas.ts`).** Percorre o registry
  de rotas da api (`routes.ts`), chama cada rota autenticada como membro semeado e acumula os corpos de
  resposta; `naoContem(sentinela)` falha apontando rota e caminho JSON. Base para SEC-020. Inclui
  fábrica de tokens de teste (membro de loja A, membro de loja B, operador, anônimo) assinados com um
  JWKS local de teste, sem depender do Supabase.
  (commit: `feat(security): varredura de respostas e atores de teste`)
- [ ] 9. **Teste de dump (`scripts/check_dump_secrets.sh` + `test/dump.test.ts`).** Semeia sentinelas
  (etapa 6) no banco de teste, roda `pg_dump` (dados + schema) e faz `grep -F` pelas sentinelas
  **em claro**; falha se alguma aparecer. Também afirma que o dump **contém** o ciphertext e o hash
  (prova de que o dado foi gravado e que o teste não é vazio). Reusa o resolvedor de `psql`/`pg_dump`
  com espaço no caminho do Windows já usado em `check_rls_coverage.sh`.
  (commit: `test(security): dump do banco nao contem segredo em claro`)
- [ ] 10. **Teste de bundle (`scripts/check_bundle_secrets.sh` + `test/bundle.test.ts`).** Roda
  `npm run build` do `frontend/` com variáveis `VITE_*` de teste (anon key sentinela) e uma
  `service_role` sentinela presente no ambiente do processo; faz grep no `dist/` e falha se a
  service_role (ou qualquer chave `SUPABASE_SERVICE_ROLE`/`META_*`/`*_KEY` não pública) aparecer. Afirma
  que só a anon key esperada está presente. O frontend continua standalone: o script só lê `dist/`.
  Só ativo quando `frontend/` já tem build (F6); antes disso o teste fica `todo` e documenta o motivo.
  (commit: `test(security): bundle do front nao vaza service_role`)
- [ ] 11. **Gate de RLS no CI.** Garantir que `check_rls_coverage.sh` roda no workflow do CI (job de
  backend), após `validate_migrations.sh`, em Postgres de serviço. Falha do script falha o job.
  Documentar a flag no cabeçalho do script (uso no CI já descrito).
  (commit: `ci(security): check_rls_coverage no gate`)
- [ ] 12. **Gate da suíte `security/` no CI.** Acrescentar o step `npm run test:security` ao mesmo job
  que roda lint/typecheck/test, com Postgres de serviço e o seed. Torná-lo **obrigatório** (required
  check) para merge em `main` e `development`. Saída em formato que liste os ids `SEC-###` que falharam
  (convenção: todo `describe`/`it` carrega o id no nome, ver etapa 13).
  (commit: `ci(security): suite security no gate de lint/typecheck/test`)
- [ ] 13. **Convenção de id e verificação de rastreabilidade (`test/rastreabilidade.test.ts`).** Todo
  teste de segurança nomeia o id no título (`SEC-021: ...`). Este teste lê `docs/pivot/SEGURANCA.md`,
  extrai todos os `SEC-###` e lê um registro `catalogo_estado.json` (id -> `verde | pendente | n/a` +
  módulo dono). Falha se: um SEC do documento não está no registro; um SEC marcado `verde` não tem
  teste com esse id; ou um teste cita um id inexistente. É o que impede "esquecer" um item do catálogo.
  (commit: `test(security): rastreabilidade entre SEGURANCA.md e a suite`)
- [ ] 14. **Primeiros SEC verdes via harness.** Com a infraestrutura pronta, ligar SEC-011 (script de
  RLS, já verde) e os casos da matriz que dependem só de F0 (SEC-021, 022, 030, 031, 032, 033 no nível
  de privilégio de coluna/tabela). Registrar no `catalogo_estado.json`.
  (commit: `test(security): primeiros SEC verdes pela matriz de roles`)
- [ ] 15. **Documentação operacional do harness.** Seção curta no `backend/AGENTS.md` (ou `README` da
  pasta `security/`): como rodar local, como acrescentar uma linha na matriz, como acrescentar um SEC,
  como os testes de dump e bundle funcionam, e o passo da revisão Opus. Sem regra de negócio.
  (commit: `docs(security): como rodar e estender a suite`)
- [ ] 16. **Revisão Opus do harness.** Um revisor **Opus** confere: a matriz cobre todas as tabelas e
  os três roles; os testes realmente reprovam (meta-teste); nenhum teste loga ou persiste segredo real;
  o gate é obrigatório; o catálogo está rastreado. Parecer registrado em "Notas e decisões".
- [ ] Testes de unidade do módulo passando (`npm run test:security` e `npm test` verdes)

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
