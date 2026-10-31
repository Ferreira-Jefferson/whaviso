# P-usuarios plataforma_usuarios

- **ID:** P-usuarios (antigo P-clientes)  ·  **Área:** P  ·  **Onda:** 4
- **Modelo sugerido:** Sonnet  ·  **Status:** `CONCLUIDO` (backend; ver nota 2026-10-30)
- **Reivindicado por:** (livre)

## Objetivo

Console do operador para enxergar os **restaurantes e as pessoas que usam a Whaviso**: lista de
contas, as lojas de cada uma, quem é o dono, situação da assinatura (só leitura aqui), saúde do
número de WhatsApp (status, nunca o número em claro) e data de cadastro. O conceito de borda é o
**usuário**, não "cliente": um usuário pode ser o dono de um restaurante, alguém da equipe desse
dono (cadastrado por ele próprio depois), ou alguém da equipe interna da Whaviso sem restaurante
nenhum. Quem cadastra a própria loja é sempre o usuário, nunca o operador (ver [[11-quem-pode-logar-ativacao]]).

O cadastro de usuário pelo operador (`POST /plataforma-usuarios/usuarios`) cobre três caminhos:
1. **Vincular a uma loja já cadastrada**, pelo código público dela (`lojas.codigo_publico`, hash
   curta visível na ficha da conta; mesmo código que o cardápio virtual, futuro, vai usar no link
   público). Exige que o e-mail já tenha acessado o Whaviso uma vez.
2. **Criar uma conta nova** (dono ainda sem loja; ele mesmo cria a loja depois, `POST /v1/lojas`),
   com `plano_id` opcional associando uma assinatura inicial (`trial`) à conta.
3. Em qualquer caminho, um toggle `ativo` decide se o acesso de login já fica aprovado na hora
   (allowlist, [[10-acessos-permissoes]]) ou pendente, aguardando aprovação (ex.: pagamento). Se a
   pessoa nunca logou, a conta fica "pré-provisionada" (sem dono) até o primeiro login.

Entrega também a **gestão da equipe Whaviso** (`operadores`: convidar, trocar papel, desativar),
restrita a `admin`, que continua separada (tela "Equipe"): é gente da Whaviso, não um usuário do
restaurante.

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
- **Contratos Zod (kernel `contracts`):** `PlataformaContaResumo`, `PlataformaContaFicha`
  (`lojas[].codigo_publico` incluso), `PlataformaLojaResumo`, `NovoUsuario`, `NovoUsuarioSaida`,
  `OperadorDTO`, `OperadorConvite`, `OperadorPatch`, paginação padrão (`cursor`, `limite` máx 100).
- **Rotas:** `GET /plataforma-usuarios/contas`, `GET /plataforma-usuarios/contas/:id`,
  `POST /plataforma-usuarios/usuarios`, `GET /plataforma-usuarios/operadores`,
  `POST /plataforma-usuarios/operadores`, `PATCH /plataforma-usuarios/operadores/:id` (admin).

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/plataforma_usuarios/**` (rotas, serviço, queries, contratos locais,
  testes, `MODULE.md`)
- `backend/apps/api/src/routes.ts` (**1 linha** de registro)
- `backend/packages/shared/src/contracts/plataforma_usuarios.ts` (contratos do módulo no kernel, só
  este arquivo; regenerar `_generated` via `gen_contracts`)
- `backend/apps/api/test/security/plataforma_usuarios.*.test.ts` (arquivos novos, prefixo do módulo)

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

## 2026-10-30: rename para "usuários" + pré-provisionamento

Jeff decidiu que "cliente" não era o conceito certo para este módulo: existe uma distinção entre o
**usuário** (quem tem acesso ao Whaviso) e o **dono de restaurante** (só um tipo de usuário). Módulo,
rotas e contratos renomeados de `plataforma_clientes` para `plataforma_usuarios`. Implementado:

- `lojas.codigo_publico` (migration `0095_usuarios_plataforma.sql`): hash curta e única por loja,
  exposta na ficha da conta. Hoje só identifica a loja para o vínculo de usuário por código; é o
  mesmo código que o futuro cardápio virtual (ainda não construído) vai usar no link público.
- `contas.dono_user_id` passou a aceitar `NULL`: o operador pode pré-criar a conta (com plano) para
  um e-mail que nunca logou. O bootstrap do módulo `conta` (`criarConta`) vincula o dono de verdade
  no primeiro login, lendo `acessos_permitidos.conta_id`, em vez de criar uma conta nova.
  Este é o "Caso 3" de [[11-quem-pode-logar-ativacao]]: o operador aprova o acesso por dentro do
  sistema, sem exigir login prévio.
- Permissões da grade renomeadas: `clientes_plataforma:ver`/`:criar` → `usuarios_plataforma:ver`/`:criar`.
- Frontend (modal "Novo usuário", exibição do código público na ficha da loja): ver trabalho em
  andamento após esta nota.

## 2026-10-31: atribuição de chave do pool de IA por loja

Adicionado à ficha da conta (`FichaContaDialog`, cada item de `Lojas`): quando há pelo menos uma
chave ATIVA no pool de LLM da plataforma (ver `../backend-api/configuracoes_llm.md#addendum` e
`configuracoes.md`), aparece um seletor "Usar chave de IA do pool" por loja. O operador escolhe a
chave e confirma (`PUT /v1/llm/pool/atribuicoes/:lojaId`, dono é o módulo `configuracoes_llm`, não
este); este módulo só chama a rota por HTTP (nunca importa o outro módulo) e invalida a própria
`ficha` ao salvar. Não há "desatribuir" aqui: a loja volta a usar a própria chave quando cadastra
uma (`PUT /llm/credencial`, ação dela mesma, fora deste console).
