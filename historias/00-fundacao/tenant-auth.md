# F3 tenant-auth

- **ID:** F3  ·  **Área:** F  ·  **Onda:** 0
- **Modelo sugerido:** Opus  ·  **Status:** `CONCLUIDO` (revisao Opus aprovada)
- **Reivindicado por:** F3-agent

## Objetivo

Entregar o kernel de identidade e escopo da `api`: (1) validação **local** do JWT do Supabase por JWKS
(qualquer emissor OIDC substituível), (2) **escopo de loja**: dado o usuário, resolve as lojas a que ele
pertence via `membros` (papel dono/gerente/atendente, `loja_id` NULL = todas as lojas da conta) e
entrega ao módulo um helper que injeta `WHERE loja_id = ANY($lojas)`, e (3) **escopo de operador**
(equipe Whaviso) via `operadores`, que acessa só métricas/faturamento e nunca conteúdo de loja. "Pronto"
observável: uma rota de exemplo protegida resolve o escopo certo; token inválido é 401; Loja A não
enxerga Loja B; um operador não lê conversa nem pedido; membro não vira operador. Este módulo é a base
de segurança multi-tenant: toda feature a consome.

## Dependências

- `F0`: tabelas `membros`, `lojas`, `contas`, `operadores`, `eventos_auth` e os roles.
- `F1`: enum `papel_membro`, contrato de erro e DTOs de sessão (`SessaoDto`, `EscopoLoja`) no kernel.
- (F4 consome este módulo; F3 não depende de F4. As peças de F3 que precisam de Fastify são plugins
  independentes, registrados por F4. Ver Notas.)

## Contratos e tabelas que toca

- Lê: `membros` (user_id -> papel + lojas), `lojas` (existência/ativo), `operadores` (user_id ->
  papel operador/admin). Escreve: `eventos_auth` (auditoria de login/negação), append-only.
- Contratos: `SessaoDto`, `EscopoLoja` (`{ tipo:'loja', user_id, conta_id, loja_ids, papel_por_loja }`),
  `EscopoOperador` (`{ tipo:'operador', user_id, papel }`), união `Escopo`.
- **Não** usa o `service_role` do Supabase nem PostgREST. Acesso a dados só por `shared/db` (F4); até F4
  existir, a camada de leitura é injetável (interface `LeitorEscopo`) com fake em teste.

## Arquivos (escopo de edição)

- `backend/apps/api/src/shared/auth/**` (JWKS, verificação, plugin de autenticação)
- `backend/apps/api/src/shared/tenant/**` (escopo de loja, papéis, helper de filtro)
- `backend/apps/api/src/shared/operador/**` (escopo de operador)
- `backend/packages/shared/src/contracts/sessao.ts` (DTOs de sessão/escopo)
- `backend/apps/api/src/shared/eventos_auth/**` (se necessário para gravar negações)
- Remover/migrar `apps/api/src/shared/tokens/**` e `supabase_admin/**` legados só se ficarem sem uso
  (decisão registrada em Notas).

## Etapas

- [x] 1. Inventário do `shared/auth` legado (login WhatsApp OTP, supabase_admin): o que o novo modelo
  mantém (JWT por JWKS) e o que sai. Registrar em Notas.
  (commit: `chore(api): inventario do auth legado`)
- [x] 2. Contratos de sessão/escopo no kernel (`SessaoDto`, `EscopoLoja`, `EscopoOperador`, `Escopo`).
  (commit: `feat(shared): contratos de sessao e escopo`)
- [x] 3. Verificador de JWT por JWKS local: busca e **cache** do JWKS (TTL, refresh em `kid` desconhecido
  com limite de taxa para não virar DoS), valida assinatura, `exp`, `nbf`, `iss`, `aud`, algoritmo
  permitido (allowlist, sem `none`/HS), e extrai `sub`. Biblioteca: `jose`.
  (commit: `feat(api): verificacao de JWT por JWKS com cache`)
- [x] 4. Testes do verificador com par de chaves gerado em teste: token válido, expirado, assinatura
  trocada, `alg=none`, `iss`/`aud` errados, `kid` desconhecido, JWKS indisponível (falha fechada).
  (commit: `test(api): verificador de JWT (SEC-040)`)
- [x] 5. Plugin Fastify `autenticar`: lê `Authorization: Bearer`, verifica, anexa `request.usuario`
  (`user_id`); 401 com envelope padrão. Nunca loga o token.
  (commit: `feat(api): plugin de autenticacao`)
- [x] 6. `LeitorEscopo` (interface) + implementação SQL parametrizada: `lojasDoUsuario(user_id)` via
  `membros` (expande `loja_id NULL` para todas as lojas ativas da conta) e `operadorDoUsuario(user_id)`.
  Cache curto por requisição (não entre requisições, para revogação imediata).
  (commit: `feat(api): resolucao de escopo por membros e operadores`)
- [x] 7. Plugin `escopoLoja`: resolve o escopo, aceita o `loja_id` ativo vindo do header/rota
  **apenas se** pertencer ao conjunto resolvido (senão 403/404); expõe `request.escopo`. Nunca confia
  em `loja_id` do corpo/token (SEC-002).
  (commit: `feat(api): plugin de escopo de loja`)
- [x] 8. Helper de consulta escopada: `comEscopoLoja(escopo, tabela...)` / fragmento
  `loja_id = ANY($n)` que os módulos usam, mais guarda de papel `exigirPapel('dono','gerente')`.
  Tabela de permissões por papel (dono/gerente/atendente) centralizada e testável.
  (commit: `feat(api): helper de filtro por loja e guarda de papel`)
- [x] 9. Plugin `escopoOperador`: exige linha em `operadores`; **bloqueia por padrão** qualquer rota
  marcada como `conteudo_de_loja` (lista de tags de rota), permitindo só rotas `plataforma`.
  (commit: `feat(api): plugin de escopo de operador com bloqueio de conteudo`)
- [x] 10. Auditoria: grava `eventos_auth` para login resolvido e para **negação** de escopo (sem PII;
  usa hash de user quando aplicável). (commit: `feat(api): auditoria de acesso e negacao`)
- [x] 11. Rotas de demonstração só em teste (`/__teste/loja`, `/__teste/plataforma`) para o harness
  exercitar sem depender de módulos reais.
  (commit: `test(api): rotas de teste para o kernel de escopo`)
- [x] 12. Testes de integração contra `whaviso_dev` (SEC-001/002/003/041): ver abaixo.
  (commit: `test(api): isolamento multi-tenant e escopo de operador`)
- [x] 13. Revisão Opus contra SEGURANCA.md: APROVADA. Verificado em código: allowlist de algoritmo
  assimétrico (construção + runtime, fecha confusion); falha fechada em JWKS/DB/ambiguidade; loja ativa
  só de header/param, nunca corpo/query/claim (SEC-002); 404 sem vazar existência (SEC-001); operador
  bloqueio-por-padrão (SEC-003); kernel só faz SELECT em operadores, sem auto-promoção (SEC-041); SQL
  parametrizado (SEC-080); sem cache entre requisições (revogação imediata); token/PII fora de log.
  Pendências de coordenação (não bloqueiam): confirmar o nome do header `x-loja-id` com o contrato do
  front (F6); limitação single-conta é deliberada (fecha fechado), módulo multi-conta futuro refina.
- [x] 14. `npm run lint`, `typecheck`, `test` verdes.

## Testes e segurança exigidos

- **SEC-040**: token inválido/expirado/assinatura trocada/`alg=none`/issuer errado é rejeitado (etapa 4).
- **SEC-001**: com duas lojas semeadas, membro de A pedindo recurso de B pela rota de teste recebe 403/404,
  nunca o dado; também para membro com `loja_id` NULL limitado à conta.
- **SEC-002**: forjar `loja_id` no corpo, query ou em claim do token não muda a loja efetiva; só o conjunto
  resolvido por `membros` vale.
- **SEC-003**: operador chama rota marcada `conteudo_de_loja` (conversas, pedidos, mensagens) e recebe
  403; rotas `plataforma` passam.
- **SEC-041**: não existe rota nem payload que promova `membros` a `operadores`; tentativa de
  autoatribuição de papel (inclusive membro mudando o próprio papel) falha. Teste explícito na matriz.
- Unidade: tabela de papéis, expansão de `loja_id NULL`, revogação (membro removido perde acesso na
  próxima requisição), falha fechada quando o banco do escopo falha.

## Notas e decisões

- F4 depende de F3, mas F3 precisa de um app Fastify para os plugins. Decisão: F3 entrega **plugins
  puros** (`fastify-plugin`) e os testa com uma instância Fastify mínima de teste; F4 só registra. Assim
  não há dependência circular.
- Escopo de operador é por **aplicação**, não por RLS (o banco continua com roles de serviço). Hardening
  opcional por GUC (`SET LOCAL app.loja_id` + policy) fica registrado como defesa em profundidade para
  depois; não entra aqui.
- Mapa de permissões por papel (dono/gerente/atendente) é decisão de produto mínima: dono tudo na conta,
  gerente tudo na loja exceto conta/membros/cobrança, atendente só conversas/pedidos. Os módulos
  `API-conta` e demais refinam; este módulo fornece o mecanismo, não a política fina.
- **Motor de acessos editável (refino posterior):** a política por papel deixou de ser padrão fixo no
  código e virou uma grade de permissões por papel, editável pela plataforma na tela de Acessos, lida em
  runtime pelo mesmo mecanismo de guarda deste módulo. As regras de produto dessa grade (convenção de
  chaves `:ver`/`:gerir`/`:configurar`, papéis fixos, o que fica fora da grade por ser fixo de dono como a
  administração da conta e a desativação de loja, e os padrões notáveis) estão em
  `../regras-negocio/10-acessos-permissoes.md`. Os padrões semeados reproduzem este mapa, sem regredir
  acesso.
- Signup/abertura de conta (SEC-042) e rate limit (SEC-101) são de `API-conta`/F4; aqui só o mecanismo
  de auditoria.
- Login em si (Google/OTP) acontece no Supabase Auth no front (F6); a api só valida o JWT.

### Decisões da implementação (F3-agent)

- **Inventário do legado (etapa 1):** o `shared/auth` legado (JWKS + `profiles`/owner/user + bloqueio de
  suspenso) foi apagado no clean slate. MANTIDO o padrão JWKS/jose (ES256, issuer `${url}/auth/v1`,
  aud `authenticated`). SAIU todo o acoplamento a `profiles`/role owner-user. `tokens` (sha256) segue em
  uso pela auditoria; `supabase_admin` ficou intocado (login/merge de conta é de F6/API-conta, fora do
  escopo deste módulo); não removi nenhum dos dois.
- **Uma conta por escopo de usuário (fail closed):** `montarEscopoLoja` assume um usuário vinculado a UMA
  conta (caso dominante). Vínculos em >1 conta lançam `ErroEscopoAmbiguo` e o plugin NEGA (403), em vez de
  adivinhar a conta efetiva e arriscar cruzar tenant. Multi-conta, se um dia for requisito, é refino de
  módulo futuro sobre este mecanismo seguro.
- **Loja ativa só de header/rota:** `escopoLoja` lê a loja ativa apenas de `x-loja-id` ou parâmetro de rota,
  nunca de corpo/query/claim (SEC-002). Loja fora do conjunto resolvido devolve 404 (não vaza existência de
  loja de outra conta), não 403.
- **Allowlist de algoritmos:** só assimétricos (`ES256`,`RS256` por padrão). O verificador recusa construir
  com `none`/`HS*` na allowlist e a `jose` rejeita esses algoritmos em runtime (fecha algorithm-confusion).
- **Auditoria de acesso (etapa 10):** gravo `eventos_auth` (append-only, sem PII; usuário só como sha256 em
  `detalhes.sujeito`) nas NEGAÇÕES de escopo (`login_negado`), que é o evento de segurança relevante. NÃO
  logo cada resolução bem-sucedida no hot path (seria 1 insert por requisição autenticada = DoS na trilha);
  `registrarEventoAcesso('login_ok',...)` fica disponível para a superfície de login real (F6/API-conta)
  usar no momento do login. Auditoria é best-effort: falha de insert nunca derruba a requisição.
- **`EscopoLoja` ganhou `loja_ativa` (nullable)** além dos campos do spec F1, para carregar a loja
  selecionada na requisição sem um segundo objeto. Campo aditivo; o codegen do front reemite.
- **Camada de dados injetável:** `LeitorEscopo` (interface) com `criarLeitorEscopoSql(executor)` (queries
  parametrizadas, roda sob `whaviso_api`). Testes unitários usam fake; integração usa o SQL real contra
  `whaviso_dev`. Quando F4 entregar `shared/db`, basta passar o pool a `criarLeitorEscopoSql`.
- **Estado do banco:** `whaviso_dev` recriado por `validate_migrations.sh` (baseline 0001-0012); os 9 testes
  de integração (SEC-001/002/003/041 + revogação + fail-closed) rodam verdes nele.
