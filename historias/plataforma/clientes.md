# P-clientes plataforma_clientes

- **ID:** P-clientes  ·  **Área:** P  ·  **Onda:** 4
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Console do operador para enxergar os **restaurantes como clientes da Whaviso**: lista de contas, as
lojas de cada uma, quem é o dono, situação da assinatura (só leitura aqui), saúde do número de
WhatsApp (status, nunca o número em claro) e data de cadastro. Entrega também a **gestão da equipe
Whaviso** (`operadores`: convidar, trocar papel, desativar), restrita a `admin`.

"Pronto" observável: um operador autenticado lista e busca contas, abre a ficha de uma conta com lojas,
membros (nome e papel, sem contato) e situação de cobrança; um membro de loja recebe 403 em todos os
endpoints `/plataforma/*`; um teste prova que **nenhum** endpoint do módulo devolve conversa, pedido,
mensagem, cliente final ou endereço (SEC-003).

## Dependências

- `F4` api-core: server/routes registry, `http_errors`, fronteira `shared/db`.
- `F3` tenant-auth (escopo de **operador**): `requireOperador({ papel? })` e o contexto
  `req.operador`. Este módulo é o primeiro consumidor real; sem ele não há como distinguir operador de
  membro. Não comece antes de F3 `CONCLUIDO`.

## Contratos e tabelas que toca

- **Dono de escrita:** `operadores` (CRUD da equipe, só `admin`).
- **Lê por read-model (somente `SELECT`, via `shared/db`):** `contas`, `lojas`, `membros` (só
  `papel`, `criado_em`, `user_id` para nome via `auth`/perfil, nunca contato), `numeros_whatsapp`
  (**somente** `status`, `verificado`, `criado_em`; as colunas `token_cifrado`, `numero_hash` ficam de
  fora do `SELECT`), `assinaturas` (último status por conta, para a coluna "situação").
- **Não toca, por princípio (lista de proibidas):** `pedidos`, `itens_pedido*`, `conversas`,
  `mensagens`, `clientes`, `enderecos`, `pagamentos`, `loja_pix`, `credenciais_llm`, `uso_llm`,
  `base_conhecimento`, `cache_semantico`, `motoboys*`, `envios`. Nenhuma delas pode aparecer em SQL deste
  módulo.
- **Contratos Zod (kernel `contracts`):** `PlataformaContaResumo`, `PlataformaContaFicha`,
  `PlataformaLojaResumo`, `OperadorDTO`, `OperadorConvite`, `OperadorPatch`, paginação padrão
  (`cursor`, `limite` máx 100).
- **Rotas:** `GET /plataforma/contas`, `GET /plataforma/contas/:id`, `GET /plataforma/operadores`,
  `POST /plataforma/operadores`, `PATCH /plataforma/operadores/:id` (admin).

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/plataforma_clientes/**` (rotas, serviço, queries, contratos locais,
  testes, `MODULE.md`)
- `backend/apps/api/src/routes.ts` (**1 linha** de registro)
- `backend/packages/shared/src/contracts/plataforma_clientes.ts` (contratos do módulo no kernel, só
  este arquivo; regenerar `_generated` via `gen_contracts`)
- `backend/apps/api/test/security/plataforma_clientes.*.test.ts` (arquivos novos, prefixo do módulo)

## Etapas

- [ ] 1. Scaffold do módulo com `scaffold_module.sh api plataforma_clientes` e `MODULE.md` listando
  tabelas lidas, colunas permitidas e a lista de tabelas proibidas  (commit: `feat(plataforma-clientes): scaffold do modulo`)
- [ ] 2. Contratos Zod no kernel (`ContaResumo`, `ContaFicha`, `LojaResumo`, `Operador*`) e regenerar
  `_generated`  (commit: `feat(contracts): contratos de plataforma_clientes`)
- [ ] 3. Hook de escopo: todas as rotas com `preHandler` de operador; `admin` exigido nas de escrita de
  `operadores`. Nenhuma rota aceita `loja_id`/`conta_id` do corpo como escopo (o operador é global, mas o
  alvo vem sempre de `params` validado por Zod)  (commit: `feat(plataforma-clientes): guarda de escopo operador`)
- [ ] 4. Query `listarContas` paginada por cursor (`criado_em`, `id`), com busca por nome da conta/loja
  (`ILIKE` parametrizado, mínimo 2 caracteres, escapar `%` e `_`) e filtro por situação da assinatura
  (`trial|ativa|suspensa|cancelada|sem_assinatura`)  (commit: `feat(plataforma-clientes): listagem de contas`)
- [ ] 5. Query `fichaConta`: conta + lojas + membros (papel, sem contato) + número (status/verificado) +
  última assinatura. `SELECT` com colunas explícitas (proibido `SELECT *`)  (commit: `feat(plataforma-clientes): ficha da conta`)
- [ ] 6. CRUD de `operadores` (admin): convidar por e-mail (cria vínculo por `user_id` quando o
  usuário existir no Auth; se não existir, registra convite pendente em `eventos` e conclui no primeiro
  login, decisão abaixo), trocar `papel`, desativar (`ativo=false`, nunca remover). Invariantes: sempre
  resta ao menos 1 `admin` ativo; operador não edita a si mesmo para `admin`; todas as mutações geram
  linha em `eventos` (sem PII)  (commit: `feat(plataforma-clientes): gestao de operadores`)
- [ ] 7. Teste estático de fronteira: varre o SQL do módulo e falha se citar qualquer tabela da lista de
  proibidas ou `SELECT *`  (commit: `test(plataforma-clientes): guarda estatica de tabelas de conteudo`)
- [ ] 8. Testes de integração (api + banco `whaviso_dev`): listagem, busca, ficha, paginação, 403 para
  membro, 401 sem token, invariantes de admin  (commit: `test(plataforma-clientes): integracao`)
- [ ] 9. Registro em `routes.ts` e `MODULE.md` final  (commit: `feat(plataforma-clientes): registrar rotas`)
- [ ] Testes de unidade do módulo passando; `npm run lint && npm run typecheck && npm test`
- [ ] Revisão (Opus) contra SEGURANCA.md (SEC-003, SEC-041) antes de `CONCLUIDO`

## Testes e segurança exigidos

- **SEC-003** (obrigatório): com token de operador, todo endpoint de conteúdo de loja
  (`/pedidos`, `/conversas`, `/clientes`, `/pagamentos`, `/motoboys`...) responde 403, e os endpoints deste
  módulo nunca incluem campos de conteúdo no payload (asserção de chaves da resposta contra allowlist).
  O teste vive em `test/security/` e é reaproveitado pelos demais módulos `plataforma_*`.
- **SEC-001/002**: membro de loja chamando `/plataforma/*` recebe 403; `conta_id`/`loja_id` forjados
  no corpo/query não ampliam nem trocam escopo.
- **SEC-041**: nenhum endpoint promove `membros` a `operadores` sem ser `admin` já existente; operador
  não se autopromove (teste de autoatribuição de papel).
- **SEC-080/081**: busca parametrizada com entrada maliciosa (`'; drop`, `%`, `_`) não altera a
  query; limites e enums validados pelo Zod.
- **SEC-024**: respostas e logs não carregam telefone, token nem e-mail de membro em claro além do
  necessário (e-mail de operador aparece só na gestão de operadores para `admin`).
- Unidade: paginação por cursor estável, invariante "último admin", busca com escape.

## Notas e decisões

- **Operador não é membro e não vê conteúdo.** Decisão: a defesa é em camadas: (a) guarda de escopo por
  tipo de identidade (F3), (b) o módulo nunca cita tabela de conteúdo (teste estático), (c) colunas
  explícitas. Como `whaviso_api` tem `SELECT` nas tabelas de conteúdo (um único role atende api inteira),
  o banco **não** barra sozinho; por isso o teste estático e a asserção de payload são bloqueantes.
- **Convite de operador:** decidido registrar em `eventos` e resolver no login (F3 casa o e-mail do
  JWT com o convite pendente). Se F3 preferir outro mecanismo, ajustar só a etapa 6.
- **Saúde do número** mostra apenas status/verificado. Telefone da loja não é exibido ao operador (já
  é hash no banco; a cifra não é decifrada aqui).
- **Ações de suspender/reativar** moram em `P-cobranca` (muda `assinaturas.status`); aqui só se exibe o
  resultado, para não ter dois donos da mesma transição.
- Cobertura multi-loja: ficha lista todas as lojas da conta; conta sem loja é válida (cadastro
  incompleto) e aparece com contagem 0.
