# @whaviso/security: trilho de testes de seguranca (F7)

Infraestrutura que transforma cada `SEC-###` do
[docs/pivot/SEGURANCA.md](../../docs/pivot/SEGURANCA.md) em teste automatizado barato de escrever e
impossivel de esquecer. Nao implementa os SEC de cada superficie: entrega os trilhos e uma amostra
verde de cada tipo. Fonte de verdade do catalogo: SEGURANCA.md + `catalogo_estado.json`.

Este workspace **nao e modulo de feature**: consome so pontos de entrada publicos (`@whaviso/shared`,
a fabrica/plugins do app) e nunca `modules/**`.

## Como rodar

```bash
cd backend
npm run test:security     # so a suite de seguranca (vitest run --root security)
npm test                  # api + zap + shared (NAO inclui security; use test:security)
bash scripts/check_rls_coverage.sh whaviso_dev     # SEC-011 (cobertura de RLS)
bash scripts/check_dump_secrets.sh  whaviso_dev     # SEC-023 (dump sem segredo em claro)
bash scripts/check_bundle_secrets.sh                # SEC-025 (bundle do front; todo ate F6)
```

Requisitos: Postgres LOCAL `whaviso_dev` (recrie com `bash scripts/validate_migrations.sh whaviso_dev`).
A suite **so fala com o banco local**: `helpers/conexao.ts::garantirBancoLocal()` aborta se o host
parecer do Supabase cloud. Testes de banco se **pulam com aviso** quando o banco esta offline; os de
dump/RLS se pulam sem `bash`/`pg_dump`. No Windows o `pg_dump`/`psql` com espaco no caminho e
resolvido pelo mesmo mecanismo do `check_rls_coverage.sh`.

## Mapa dos arquivos

| Area | Arquivo | Papel |
|---|---|---|
| Conexao | `helpers/conexao.ts` | pool de superusuario + guarda "so banco local" |
| Roles | `helpers/db_roles.ts` | `comoRole` (SET LOCAL ROLE + rollback), `operarComoRole` |
| Matriz | `matriz/privilegios.ts` | matriz declarativa (dado) + catalogo de tabelas conhecidas |
| Matriz | `helpers/operacao_sql.ts`, `helpers/avaliacao.ts` | SQL sem efeito + avaliacao conforme/nao |
| Segredos | `fixtures/segredos.ts` | sentinelas grep-aveis + semeadura pela forma de repouso |
| Log | `helpers/captura_log.ts` | captura o logger do F4 em memoria (SEC-024) |
| Respostas | `helpers/varre_respostas.ts`, `helpers/atores_teste.ts` | scanner de respostas + atores JWKS locais |
| Shell | `helpers/shell.ts` | roda os scripts bash e o `pg_dump` de dentro dos testes |
| Catalogo | `catalogo_estado.json` | id SEC -> estado + modulo dono + teste |

## Como acrescentar uma linha na matriz de privilegio

Edite `matriz/privilegios.ts`:

- **Tabela nova:** adicione em `TABELAS_CONHECIDAS` com a decisao de `apiDelete`
  (`negado` por padrao; `permitido` so com justificativa, como `templates`). O teste de completude
  **falha** ate a tabela entrar aqui, forcando a decisao de privilegio.
- **Caso por coluna/operacao:** adicione uma linha em `CASOS_ESPECIFICOS`
  (`{ role, tabela, coluna?, operacao, esperado, sec }`). Toda negacao deve ter um espelho de
  permissao (o ator legitimo passa). O executor gera um `it` por linha automaticamente.

A fonte dos grants e `supabase/migrations/0001..00NN`; se um grant mudar, a matriz muda junto.

## Como acrescentar um SEC

1. Descreva o `SEC-###` em `docs/pivot/SEGURANCA.md` e na `historias/seguranca/catalogo.md`.
2. Escreva o teste com o id **no titulo** (`SEC-###: ...`), no modulo dono ou aqui.
3. Registre em `catalogo_estado.json` (`estado`, `modulo`, `teste`). O teste de rastreabilidade
   (`test/rastreabilidade.test.ts`) **falha** se: um SEC do documento nao estiver no registro, um
   `verde` nao tiver teste com o id, ou um teste citar id inexistente.

## Dump e bundle

- **Dump (SEC-023):** `fixtures/segredos.ts` semeia os quatro segredos sentinela na **forma de
  repouso** (cifra `bytea` + `sha256`), commita, e o teste roda `pg_dump`: nenhuma sentinela em
  claro; a cifra e o hash **presentes** (prova de que o teste nao e vazio). A semeadura usa hoje um
  stand-in via `pgcrypto`; quando o `cifrar()` de producao existir (API-config-llm), troque a
  semeadura para chama-lo (a propriedade testada nao muda).
- **Bundle (SEC-025):** `todo` enquanto o `frontend/` (F6) nao tem `dist/`. O script
  `check_bundle_secrets.sh` ja le `frontend/dist` e barra `service_role`/`META_*`/`*_KEY`/sentinela.

## Revisao Opus (etapa 16)

Teste verde sozinho **nao encerra** a superficie. Um revisor Opus confere contra o catalogo: a matriz
cobre todas as tabelas e os tres roles; o meta-teste (`test/meta_teste.test.ts`) prova que o harness
reprova violacao; nenhum teste loga ou persiste segredo real; o gate e obrigatorio; o catalogo esta
rastreado. Em falha, os testes mostram rota/arquivo/linha, **nunca** o valor da sentinela.
