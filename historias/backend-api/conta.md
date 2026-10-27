# API-conta conta

- **ID:** API-conta  ·  **Área:** API  ·  **Onda:** 1
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Conta + membros + papéis (convite/aceite). Entrega o cadastro do tenant: o usuário recém-logado cria a
própria **conta** (vira `dono`), convida **membros** para uma loja específica ou para todas as lojas da
conta, com papel `dono`, `gerente` ou `atendente`, e o convidado aceita o convite depois de logar.
"Pronto" observável: um usuário autenticado sem conta cria a conta e a primeira loja-base; o dono gera um
convite, o convidado (outro `user_id`) aceita e passa a aparecer em `GET /conta/membros` com o papel certo,
e o escopo de loja que o kernel de tenant (F3) resolve já o enxerga. Papel insuficiente é negado.

## Dependências

- `F4` api-core: server/app/routes registry, `http_errors`, config, logger, fronteira `shared/db`. Sem
  isto não há onde registrar o módulo nem erro padronizado.
- Transitivas já exigidas por F4: `F0` (tabelas `contas`, `membros`), `F1` (contratos Zod), `F3`
  (resolução de escopo por membro: o módulo **usa** o kernel, não reimplementa JWT nem escopo).

## Contratos e tabelas que toca

- **Dono de escrita:** `contas` (insert/update), `membros` (insert/update; remoção é lógica via
  `ativo = false`, não há DELETE), `convites` (nova, ver Notas: o baseline não tem tabela de convite).
- **Lê por read-model (somente leitura, via `shared/db`, documentado no MODULE.md):** `lojas` (para
  validar que a `loja_id` do convite pertence à conta e listar nome da loja no convite). Não escreve em
  `lojas` (dono: API-lojas).
- `auth.users`: nunca lido direto pela api além do `sub` do JWT; e-mail/nome vêm do token, não do banco.
- **Contratos Zod (kernel, fonte única, F1):** `ContaCriarEntrada`, `ContaSaida`, `MembroSaida`,
  `MembroPapelAtualizarEntrada`, `ConviteCriarEntrada`, `ConviteSaida` (com `link` só na criação),
  `ConviteAceitarEntrada`. Papéis = enum `papel_membro`.
- Evento de auditoria (tabela `eventos`, sem PII): `conta.criada`, `membro.convidado`, `membro.aceito`,
  `membro.papel_alterado`, `membro.removido`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/conta/**` (rotas, service, repo, MODULE.md, testes em `test/`)
- `backend/apps/api/src/routes.ts` (1 linha de registro, combinado)
- `backend/packages/shared/src/contracts/conta*.ts` (contratos do módulo; só o arquivo do módulo)
- `backend/supabase/migrations/<proxima>_convites.sql` (tabela nova, ver Notas) e ajuste de
  `backend/supabase/seed.sql` só se precisar de convite de exemplo

## Etapas

- [ ] 1. Scaffold do módulo `conta` com `scripts/scaffold_module.sh api conta` e escrever o MODULE.md
  (dono de `contas`/`membros`/`convites`; lê `lojas`)  (commit: `chore(api-conta): scaffold do modulo conta`)
- [ ] 2. Migration `convites`: `id`, `conta_id`, `loja_id` (NULL = todas), `papel`, `token_hash` (sha256,
  unique, check formato hex 64), `criado_por_membro_id`, `expira_em`, `aceito_em`, `aceito_por_user_id`,
  `revogado_em`, `criado_em`. RLS habilitado, policy `api_convites`, grant `select, insert, update` só
  para `whaviso_api`, sem DELETE. Rodar `validate_migrations.sh` e `check_rls_coverage.sh`
  (commit: `feat(db): tabela convites com token so em hash`)
- [ ] 3. Contratos Zod do módulo no kernel + regenerar `_generated` (F1)
  (commit: `feat(contracts): contratos de conta, membros e convites`)
- [ ] 4. Repo SQL parametrizado (nenhuma interpolação): criar conta, listar membros, criar/atualizar
  membro, criar/consumir/revogar convite, buscar convite por hash  (commit: `feat(api-conta): repositorio de contas, membros e convites`)
- [ ] 5. `POST /conta` (bootstrap): cria `contas` com `dono_user_id = sub` e o `membros` dono
  (`loja_id` NULL) na mesma transação; idempotente por usuário (segunda chamada devolve a conta
  existente, não duplica)  (commit: `feat(api-conta): criar conta e membro dono`)
- [ ] 6. `GET /conta` e `PATCH /conta` (nome), restrito a `dono`  (commit: `feat(api-conta): ler e renomear conta`)
- [ ] 7. `GET /conta/membros` (dono e gerente; atendente nega) e `PATCH /conta/membros/:id`
  (alterar papel, ativar/desativar). Regras: não rebaixar nem desativar o último `dono` da conta; gerente
  não altera dono nem promove a dono; ninguém altera o próprio papel  (commit: `feat(api-conta): listar e gerir membros com guarda de papel`)
- [ ] 8. `POST /conta/convites` (dono e gerente): valida `loja_id` pertence à conta (leitura de `lojas`),
  papel permitido para quem convida (gerente só convida `atendente`/`gerente` para suas lojas), gera token
  aleatório forte de 32 bytes, persiste só o sha256, expiração de 7 dias; devolve o `link` **uma única
  vez** na resposta (nada no banco e nada em log)  (commit: `feat(api-conta): criar convite com token em hash`)
- [ ] 9. `GET /conta/convites` (pendentes, sem token) e `DELETE`-semântico `POST /conta/convites/:id/revogar`
  (marca `revogado_em`)  (commit: `feat(api-conta): listar e revogar convites`)
- [ ] 10. `POST /convites/aceitar` (qualquer usuário autenticado, mesmo sem membership): hash do token,
  valida não expirado/não aceito/não revogado, cria `membros` com `user_id = sub` na transação que marca o
  convite como aceito (uso único, `UPDATE ... WHERE aceito_em IS NULL` para evitar corrida); se o usuário
  já é membro naquela loja devolve 409 sem consumir o token  (commit: `feat(api-conta): aceitar convite de forma atomica`)
- [ ] 11. Gravar eventos de auditoria sem PII em todas as mutações  (commit: `feat(api-conta): auditoria de mutacoes de conta e membros`)
- [ ] 12. Testes de unidade e integração do módulo (ver abaixo)  (commit: `test(api-conta): suite de conta, membros e convites`)
- [ ] 13. Testes de segurança do módulo (SEC-001/002/041) e revisão do MODULE.md  (commit: `test(api-conta): sec de isolamento e escalonamento de papel`)

## Testes e segurança exigidos

**Unidade/integração (banco `whaviso_dev`, via `npm test` do workspace):**
- Bootstrap idempotente; dono criado com `loja_id` NULL.
- Matriz papel x endpoint (dono, gerente, atendente, sem membership): cada combinação esperada passa ou
  recebe 403 no envelope `{ error: { code, message } }`.
- Guarda do último dono; gerente não promove a dono; auto-alteração negada.
- Convite: expirado, revogado, já aceito, token errado, duplo aceite concorrente (só um ganha), usuário já
  membro; confirmar que o token claro não existe em nenhuma coluna nem em log.
- Validação Zod nega payload fora do contrato (papel inválido, `loja_id` não uuid).

**SEC aplicáveis:**
- `SEC-001`: membro da conta A não lista membros nem convites da conta B.
- `SEC-002`: `conta_id`/`loja_id` do corpo nunca sobrepõe o escopo resolvido; só a validação de
  pertencimento da `loja_id` do convite à conta do convidante.
- `SEC-041`: nenhum endpoint promove `membros` a `operadores`; o enum de papel aceito não contém
  `operador`/`admin`.
- `SEC-081`: validação Zod na borda.
- `SEC-101`: rate limit em `POST /convites/aceitar` (força bruta de token) e em `POST /conta`.
- `SEC-024`: redaction cobre `token` e o `link` do convite no log.

## Notas e decisões

- **Convite sem tabela no baseline:** o BANCO.md não prevê `convites`. Decisão: criar a tabela neste
  módulo (migration nova, escopo declarado acima), com token só em sha256. Quem aplicar a migration no
  cloud segue a regra da casa (perguntar antes de `db push`).
- **Entrega do convite:** a api **não envia** e-mail nem WhatsApp. Devolve o link ao dono, que o repassa.
  Evita dependência de provedor de e-mail e de template Meta nesta onda.
- **Signup aberto vs convite:** `POST /conta` exige JWT válido; o anti-spam de criação de conta
  (`SEC-042`) é rate limit aqui + configuração do provedor de login, fora do escopo deste módulo.
- **Papel por loja:** `loja_id` NULL no membro = todas as lojas da conta; resolução de escopo é do kernel
  de tenant (F3), este módulo só grava os dados que ele lê.
- Sem DELETE: remoção de membro = `ativo = false`; o kernel de tenant ignora membros inativos.
