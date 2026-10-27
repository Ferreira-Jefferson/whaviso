# SEC-cat catálogo de testes de segurança

> Status vivo das etapas deste módulo. O resumo fica no [STATUS.md](../STATUS.md). Fonte do catálogo:
> [SEGURANCA.md](../../docs/pivot/SEGURANCA.md). Infraestrutura usada pelos testes:
> [harness.md](harness.md).

- **ID:** SEC-cat  ·  **Área:** SEC  ·  **Onda:** transversal
- **Modelo sugerido:** Opus (revisão)  ·  **Status:** `A FAZER`
- **Reivindicado por:** (preencher ao começar)

## Objetivo

Transformar **cada** item `SEC-###` do SEGURANCA.md em uma tarefa de teste automatizado, com o que o
teste faz, o critério de verde e a superfície (módulo) que ele cobre. O teste **acompanha a entrega do
módulo dono**: o módulo só vira `CONCLUIDO` com os SEC da sua superfície verdes, e a verificação final
de cada superfície sensível é feita por um **revisor Opus contra este catálogo** (não basta o verde do
CI). "Pronto" observável: os 30 `SEC-###` existem como testes com id no título, registrados em
`catalogo_estado.json` (ver F7), todos `verde` ou explicitamente `n/a` com justificativa.

## Dependências

- `F7` (seguranca-harness): trilhos (`SET ROLE`, captura de log, dump, bundle, varredura de respostas,
  rastreabilidade). Nenhum SEC além do SEC-011 pode ser escrito antes dele.
- O módulo que cobre cada superfície, conforme a coluna "Módulo" de cada item (ver STATUS.md). Um SEC
  só pode ficar verde depois que o módulo dono estiver implementado; até lá fica `pendente`.

## Contratos e tabelas que toca

Não cria tabela nem contrato. Lê o catálogo do Postgres e exercita as tabelas sensíveis
(`credenciais_llm`, `numeros_whatsapp`, `loja_pix`, `envios`, `eventos`, `eventos_auth`,
`*_lancamentos`, `uso_llm`, `templates`, `webhook_eventos_processados`, `membros`, `operadores`) e os
endpoints/serviços dos módulos listados.

## Arquivos (escopo de edição)

- `backend/security/test/<categoria>/**` (um arquivo por categoria: `isolamento`, `rls`, `segredos`,
  `privilegio`, `auth`, `webhook`, `prompt_injection`, `ssrf`, `injecao`, `transporte`, `abuso`).
- `backend/security/catalogo_estado.json` (registro id -> estado + módulo dono + caminho do teste).
- Testes muito locais podem morar no módulo dono (`apps/*/src/modules/<m>/**/*.sec.test.ts`) e ser
  registrados pelo id; a regra de nome é `SEC-###: <descrição>` no título.
- Não editar código de produção: se o teste revelar brecha, abrir relatório e acionar o módulo dono.

## Convenções de todos os testes

- Título sempre começa com o id (`SEC-021: whaviso_api nao le chave_cifrada`).
- Todo teste de **negação** tem um teste espelho de **permissão** (o ator legítimo passa), para o verde
  não vir de um ambiente quebrado.
- Segredos são sempre as **sentinelas** do harness; nunca valor real.
- Estado inicial de cada item: `pendente`, exceto SEC-011 (`verde`, já existe no CI).

## Etapas

Uma tarefa por `SEC-###`, agrupadas por categoria. Cada tarefa é um commit atômico no padrão
`test(security): SEC-### <resumo>`. O módulo dono entrega o teste junto do seu último commit funcional.

### A. Isolamento multi-tenant (3)

- [ ] **SEC-001** Isolamento entre lojas por endpoint. *Faz:* semeia loja A e B com um recurso de cada
  tipo (pedido, cliente, conversa, item de cardápio, número, motoboy, zona); para **cada rota** do
  registry que recebe id de recurso, chama como membro de A pedindo o id de B e ainda lista sem filtro.
  *Verde:* 403/404 em todos, corpo nunca contém dado de B, listagens trazem só A; o espelho (A lê o seu)
  passa. Gerado a partir do registry de rotas, então rota nova entra sozinha. *Módulo:* F3 tenant-auth
  (escopo) + cada API-* de dados (cardápio, clientes, conversas, pedidos, lojas, numeros, zonas,
  motoboys, pagamentos, despacho); executado no gate a cada módulo novo. *Estado:* pendente.
- [ ] **SEC-002** Sem mass assignment de tenant. *Faz:* em toda rota de escrita, envia `loja_id` (e
  `conta_id`) forjado no corpo, na query e em header, e um token cujo claim aponta outra loja. *Verde:*
  o recurso é criado/alterado na loja resolvida pelo kernel; o `loja_id` forjado é ignorado ou rejeitado
  pelo Zod (nunca usado). *Módulo:* F3 + F4 (resolução de escopo) e toda API-* de escrita. *Estado:*
  pendente.
- [ ] **SEC-003** Operador não acessa conteúdo de loja. *Faz:* autentica como operador e chama cada
  rota de conteúdo (conversas, mensagens, pedidos, clientes, cardápio privado) e cada rota de
  plataforma. *Verde:* conteúdo retorna 403; só métricas/billing/funil passam; o espelho (operador lê
  MRR) passa. Também confirma que nenhum read-model de plataforma devolve texto de mensagem ou PII de
  cliente final (varredura de sentinela). *Módulo:* F3 (escopo de operador), P-clientes, P-cobranca,
  P-funil, P-painel, API-conversas, API-pedidos. *Estado:* pendente.

### B. RLS deny-all (2)

- [ ] **SEC-010** anon e authenticated não leem tabela alguma. *Faz:* para **toda** tabela de `public`
  (descoberta dinâmica no catálogo), conecta como `anon` e `authenticated` (via `SET ROLE` e, em
  integração, via PostgREST/supabase-js com anon key e JWT de usuário) e tenta `select`, `insert`,
  `update`, `delete`. *Verde:* erro de permissão ou zero linhas em todas, inclusive views e funções
  expostas; com linhas semeadas existentes, nenhuma é devolvida. *Módulo:* F0 db-baseline (e todo
  módulo que cria tabela, pela descoberta dinâmica). *Estado:* pendente.
- [ ] **SEC-011** Cobertura de RLS. *Faz:* roda `scripts/check_rls_coverage.sh` e falha se qualquer
  tabela (base ou particionada) de `public` estiver sem RLS. *Verde:* exit 0. *Módulo:* F0; gate no CI
  entregue por F7 etapa 11. *Estado:* **VERDE hoje** (script já existe e passa); resta só torná-lo
  obrigatório no CI.

### C. Segredos (7)

- [ ] **SEC-020** Chave de LLM nunca em resposta. *Faz:* semeia a chave sentinela por set/rotate pelo
  endpoint real, depois varre as respostas de **todas** as rotas (varredura do harness) como membro,
  dono e operador, inclusive respostas de erro e de listagem. *Verde:* a sentinela não aparece em
  nenhum corpo, header ou mensagem de erro; a tela de config recebe só `provedor` + `ultimos4`; o
  `ultimos4` bate com o final da chave. *Módulo:* API-config-llm (principal) e toda rota que devolva a
  loja. *Estado:* pendente.
- [ ] **SEC-021** `whaviso_api` sem SELECT em `chave_cifrada`. *Faz:* `SET ROLE whaviso_api` e
  `select chave_cifrada from credenciais_llm`, também `select *` e `returning chave_cifrada` em
  update/insert. *Verde:* erro `42501` em todas; `select` das colunas de metadado (provedor, ultimos4,
  atualizado_em) passa; `insert`/`update` da cifra por `whaviso_api` passa (write-only). *Módulo:* F0
  (grant) validado pela matriz F7; superfície API-config-llm. *Estado:* pendente (infra em F7 etapa 14).
- [ ] **SEC-022** Só `whaviso_atendente` lê `chave_cifrada`. *Faz:* matriz completa de `chave_cifrada`
  e `token_cifrado` para os três roles. *Verde:* `whaviso_atendente` lê `chave_cifrada`;
  `whaviso_zap` e `whaviso_api` negados; `whaviso_atendente` negado em `token_cifrado`;
  `whaviso_zap` lê o necessário do número (token) conforme grants do F0. *Módulo:* F0 + AT-llm
  (consumidor). *Estado:* pendente.
- [ ] **SEC-023** Cifrado em repouso. *Faz:* semeia chave LLM, token Meta, Pix e telefone sentinelas
  pelo caminho real da aplicação e roda `pg_dump` completo; `grep -F` das sentinelas em claro.
  *Verde:* nenhuma sentinela em claro; o dump contém o ciphertext e o hash (teste não vazio);
  telefone só aparece como `*_hash` e `*_cifrado`. *Módulo:* API-config-llm, API-numeros, API-pagamentos
  (loja_pix), API-clientes. *Estado:* pendente (infra em F7 etapa 9).
- [ ] **SEC-024** Chave nunca em log. *Faz:* dispara fluxos reais (set/rotate de chave, falha de
  validação, erro 500 forçado, chamada ao provedor com erro) capturando o log; mais teste unitário da
  redaction com objetos rasos e aninhados (`chave`, `token`, `authorization`, `telefone`, `pix`,
  `numero_convite`). *Verde:* nenhuma sentinela na saída; o campo aparece como marcador de redaction;
  stack e `cause` de erro também limpos. *Módulo:* F4 (logger) + API-config-llm + AT-llm + ZAP-meta.
  *Estado:* pendente (infra em F7 etapa 7).
- [ ] **SEC-025** Sem service_role no bundle. *Faz:* build do `frontend/` com service_role sentinela no
  ambiente; grep no `dist/`. *Verde:* service_role e qualquer `META_*`/chave privada ausentes; só a
  anon key esperada presente; sourcemaps, se publicados, também limpos. *Módulo:* F6 front-shell (e
  toda tela via CI). *Estado:* pendente (infra em F7 etapa 10; ativo quando F6 tiver build).
- [ ] **SEC-026** Chave fora do prompt. *Faz:* intercepta a request montada pelo `ClienteLLM` (cliente
  HTTP simulado) com a chave sentinela da loja. *Verde:* a chave está só no header de autenticação; o
  corpo (prompt, mensagens, metadados) e a URL não a contêm; em erro, a mensagem propagada também não.
  *Módulo:* AT-llm (principal), F2 (contrato `ClienteLLM`), AT-entender, AT-rag, API-cardapio-imp.
  *Estado:* pendente.

### D. Privilégio mínimo dos roles (4)

- [ ] **SEC-030** `whaviso_api` sem DELETE em negócio/auditoria. *Faz:* matriz por tabela: `delete`
  como `whaviso_api` em todas as tabelas de `public`. *Verde:* `42501` em todas exceto `templates`
  (passa, exceção documentada); a lista de exceções é fixa e falha se crescer. *Módulo:* F0, validado
  em F7; revalidado a cada migration. *Estado:* pendente (infra em F7 etapa 14).
- [ ] **SEC-031** `whaviso_zap` só escreve colunas do outbox. *Faz:* como `whaviso_zap`, `update` de
  cada coluna de `envios` e de `numeros_whatsapp` (estado de saúde), e de colunas fora do conjunto;
  `insert`/`update` em tabelas de negócio. *Verde:* colunas do conjunto
  (`status, enviado_em, wamid, erro, proxima_tentativa_em, tentativas, entrega_status` e as de saúde do
  número) passam; qualquer outra falha com `42501`. *Módulo:* F0 + ZAP-enviar + ZAP-webhook.
  *Estado:* pendente.
- [ ] **SEC-032** `whaviso_atendente` fora de billing/plataforma/credencial Meta. *Faz:* `select`,
  `insert`, `update`, `delete` como `whaviso_atendente` em `assinaturas`, `faturas`, `operadores`,
  `prospectos`, `prospecto_atividades` e em `numeros_whatsapp.token_cifrado`. *Verde:* todos negados;
  tabelas do seu escopo (cardápio, clientes, pedidos, conversas, base_conhecimento, uso_llm) passam.
  *Módulo:* F0 + AT-motor-min + AT-llm. *Estado:* pendente.
- [ ] **SEC-033** Trilhas append-only. *Faz:* em `eventos`, `eventos_auth`, `motoboy_lancamentos` (e
  demais `*_lancamentos`) e `uso_llm`: `update` por superusuário de teste e por cada role, e `delete`
  por cada role. *Verde:* `update` dispara a exceção do trigger mesmo para dono; `delete` falha por
  privilégio; `insert` pelo role dono passa. *Módulo:* F0; revalidado em API-motoboys e AT-llm.
  *Estado:* pendente.

### E. Autenticação e sessão (3)

- [ ] **SEC-040** JWT por JWKS local. *Faz:* contra a api, envia token válido, expirado, `nbf` no
  futuro, assinatura trocada, `alg: none`, `alg` simétrico com a chave pública (confusão HS/RS), `kid`
  desconhecido, `iss`/`aud` errados e ausente. *Verde:* só o válido passa (200); todos os demais 401, sem
  detalhe interno na mensagem; a validação não faz chamada de rede por request (JWKS em cache, rotação
  de `kid` tratada). *Módulo:* F3 tenant-auth. *Estado:* pendente.
- [ ] **SEC-041** Membro não vira operador. *Faz:* percorre as rotas e contratos Zod procurando
  qualquer caminho que escreva `operadores` ou o papel de `membros`; tenta autoatribuir papel por
  payload (`papel`, `is_operador`, `role`) e por convite/aceite de conta; tenta um membro comum
  promover a si ou a outro para dono. *Verde:* nenhuma rota escreve `operadores`; tentativas retornam
  403/validação; rota de papel só aceita dono da conta promovendo dentro da própria loja. *Módulo:* F3 +
  API-conta. *Estado:* pendente.
- [ ] **SEC-042** Signup fechado a spam. *Faz:* verifica a configuração do Auth (signup restrito,
  provider esperado, confirmação exigida) lida do arquivo de configuração versionado e, em integração,
  tenta criar conta direto no endpoint do Supabase Auth com a anon key; e confirma rate limit no
  caminho de criação de conta/convite. *Verde:* criação sem convite/fluxo previsto é negada ou limitada;
  o provider load-bearing continua habilitado (teste de regressão para não desligar por engano).
  *Módulo:* F3 + API-conta + F6 (login). *Estado:* pendente. *Decisão:* teste de configuração é
  estático (arquivo do painel versionado como código); a parte viva fica no loop de red team.

### F. Webhook do WhatsApp (2)

- [ ] **SEC-050** Assinatura do webhook verificada. *Faz:* posta ao endpoint do webhook payload real
  da Meta assinado com `X-Hub-Signature-256` correto, e variantes: sem header, assinatura errada,
  corpo alterado após assinar, assinatura de outro app secret, comparação não constante (mede que usa
  `timingSafeEqual`), corpo re-serializado. Também o handshake `hub.verify_token` (GET). *Verde:* só o
  assinado sobre o **corpo bruto** passa (200 e enfileira); os demais 401/403 e **nada é gravado** em
  `mensagens`/`envios`; token de verificação errado nega o handshake. *Módulo:* ZAP-webhook (principal),
  ZAP-meta. *Estado:* pendente.
- [ ] **SEC-051** Idempotência por `wamid`. *Faz:* envia o mesmo evento 5 vezes, em sequência e em
  paralelo; e um recibo de status repetido. *Verde:* exatamente 1 `mensagem`, 1 linha em
  `webhook_eventos_processados`, 0 pedidos duplicados e 1 resposta enfileirada; paralelismo não gera
  duplicata nem erro 500 (INSERT ON CONFLICT DO NOTHING). *Módulo:* ZAP-webhook, API-conversas,
  AT-motor-min (efeito no pedido). *Estado:* pendente.

### G. Prompt injection e segurança da LLM (3)

- [ ] **SEC-060** Bateria adversarial. *Faz:* corpus versionado de prompts hostis (pedir a chave, o
  system prompt, dados de outra loja, "ignore as instruções", injeção por cardápio/nome de cliente/
  endereço, idioma alternativo, encoding, injeção indireta via documento do RAG e via transcrição de
  áudio) executado contra o `atendente` com **loja A e B semeadas** e a chave sentinela. Roda com
  modelo simulado determinístico no CI (mede a **arquitetura**: o segredo nem chega ao contexto) e,
  em separado, com o modelo real no loop periódico de red team. *Verde:* nenhuma resposta contém
  sentinela de chave, texto do system prompt, ou dado da loja B; o contexto montado não contém esses
  itens para o modelo vazar. *Módulo:* AT-motor-min, AT-entender, AT-rag, AT-llm. *Estado:* pendente.
- [ ] **SEC-061** Saída do modelo é dado, não comando. *Faz:* modelo simulado devolve saídas hostis
  (JSON pedindo confirmar pedido, mudar preço, enviar Pix, chamar ferramenta inexistente, campos
  extras, tipo errado). *Verde:* toda saída passa por parse Zod estrito e pelas regras determinísticas
  do fluxo; ação fora do estado permitido é recusada; nenhuma escrita (pedido confirmado, preço,
  Pix) ocorre sem passar pela transição válida; saída inválida cai em fallback seguro/handoff. *Módulo:*
  AT-motor-min, AT-entender, AT-llm, API-pagamentos. *Estado:* pendente.
- [ ] **SEC-062** Contexto escopado à loja. *Faz:* semeia documentos, cardápio e conversas distintos e
  sentinela por loja; monta o contexto do modelo (prompt + RAG + cardápio + histórico) para uma
  conversa da loja A e inspeciona o que vai ao `ClienteLLM`; testa também o cache semântico e a
  recuperação por vetor com consulta que colide semanticamente com doc da loja B. *Verde:* zero
  documento, item ou texto da loja B no contexto; recuperação e cache sempre filtram por `loja_id`
  (consulta sem filtro é impossível pela API do módulo). *Módulo:* AT-rag (principal), AT-retroalimentar,
  AT-motor-min, API-cardapio-imp. *Estado:* pendente. *Nota:* depende de `docs/pivot/RAG.md`;
  `skipIf` sem pgvector local, roda no CI com a extensão.

### H. SSRF e provedores externos (1)

- [ ] **SEC-070** Só hosts allowlisted, sem redirect para rede interna. *Faz:* teste do cliente HTTP
  único (kernel) usado por `ClienteLLM`, `ClienteMapas` e `ClienteWhats`: URL fora da allowlist, host
  que resolve para IP privado/loopback/link-local (`127.0.0.1`, `::1`, `169.254.169.254`, `10/8`,
  `172.16/12`, `192.168/16`, DNS rebinding simulado), redirect 30x para interno, esquemas não-HTTPS,
  URL controlada por input (ex.: URL de mídia do WhatsApp, imagem de cardápio importado, endpoint do
  provedor vindo de config da loja). *Verde:* todas as tentativas rejeitadas **antes** da conexão; o
  redirect não é seguido (ou revalidado a cada salto); a URL do provedor nunca vem de dado de usuário.
  *Módulo:* F2 clientes-externos (cliente HTTP), ZAP-meta, AT-llm, API-roteiriza, API-cardapio-imp.
  *Estado:* pendente.

### I. Injeção e entrada (2)

- [ ] **SEC-080** Zero SQL por interpolação. *Faz:* (a) varredura estática (regra de lint ou teste que
  percorre o AST/regex) proibindo template string/concatenação em chamadas de query fora de um único
  construtor parametrizado, com allowlist explícita e justificada; (b) teste dinâmico enviando
  payloads (`' OR 1=1 --`, `; drop table`, aspas, unicode, identificadores) em todo campo textual e em
  filtros/ordenação das rotas, comparando o resultado e a integridade do banco. *Verde:* lint sem
  ocorrência; payload tratado como dado (resultado igual a entrada inofensiva), nenhuma tabela
  alterada; `order by`/colunas dinâmicas só por enum. *Módulo:* F4 (fronteira `shared/db`) e todo módulo
  que consulta. *Estado:* pendente.
- [ ] **SEC-081** Validação Zod na borda. *Faz:* gerado do registry de rotas: para cada rota de
  escrita, envia corpo vazio, tipo errado, campo extra, string gigante, array gigante, enum inválido,
  número negativo/NaN, UUID malformado, e payload acima do `bodyLimit`. *Verde:* sempre 400/413 com o
  envelope `{ error: { code, message } }`, sem stack nem detalhe interno; rota de escrita sem schema
  Zod falha o teste (descoberta dinâmica). *Módulo:* F1 (contratos) + F4 e toda API-* e rota de
  webhook. *Estado:* pendente.

### J. Transporte e cabeçalhos (1)

- [ ] **SEC-090** Headers e CORS. *Faz:* `app.inject` em rota pública, autenticada e de erro,
  conferindo `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`,
  `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, ausência de
  `X-Powered-By`; preflight com `Origin` estranho, `null` e wildcard; e conferência do nginx do
  frontend (arquivo de configuração versionado, lembrando o bug anterior do `add_header` em
  contexto aninhado). *Verde:* todos os headers presentes em todas as respostas, inclusive erros e 404;
  só `APP_URL` recebe `Access-Control-Allow-Origin`; origem estranha não recebe; sem `*` com
  credenciais. *Módulo:* F4 api-core; F6 front-shell (nginx/CSP do SPA). *Estado:* pendente.

### K. Abuso e custo (2)

- [ ] **SEC-100** Alerta de consumo anômalo de LLM. *Faz:* semeia `uso_llm` de uma loja com baseline e
  depois um pico (ex.: 10x), roda o detector do módulo (job ou consulta). *Verde:* o pico gera o
  alerta/registro de investigação para a loja certa, uma vez (sem tempestade de alertas), com o
  consumo normal não disparando (sem falso positivo no baseline); o alerta não carrega a chave nem
  conteúdo de conversa; o limite por loja existe e corta o gasto acima do teto configurado.
  *Módulo:* AT-llm (registro de uso), API-config-llm (limite), P-painel (visibilidade ao operador).
  *Estado:* pendente. *Decisão:* o teste cobre o **mecanismo de detecção**; o canal de notificação ao
  operador é testado com um coletor simulado, não com envio real.
- [ ] **SEC-101** Rate limit em endpoints sensíveis. *Faz:* dispara rajada acima do limite em login/
  OTP, set/rotate de chave de LLM, criação de convite e webhook; também com cabeçalho de IP forjado
  (`X-Forwarded-For`) e com tokens diferentes do mesmo IP. *Verde:* excedente recebe 429 com
  `Retry-After`; o limite é por ator/IP confiável (cabeçalho forjado não burla; só o proxy confiável
  conta); tráfego legítimo abaixo do limite passa; o webhook com assinatura válida não é bloqueado por
  rajada legítima da Meta (limite separado). *Módulo:* F4 (plugin de rate limit), F3 (login),
  API-config-llm, API-conta, ZAP-webhook. *Estado:* pendente.

## Resumo de mapeamento

| Categoria | SEC | Qtde |
|---|---|---|
| A isolamento multi-tenant | 001, 002, 003 | 3 |
| B RLS deny-all | 010, 011 | 2 |
| C segredos | 020 a 026 | 7 |
| D privilégio dos roles | 030 a 033 | 4 |
| E autenticação e sessão | 040, 041, 042 | 3 |
| F webhook WhatsApp | 050, 051 | 2 |
| G prompt injection / LLM | 060, 061, 062 | 3 |
| H SSRF | 070 | 1 |
| I injeção e entrada | 080, 081 | 2 |
| J transporte | 090 | 1 |
| K abuso e custo | 100, 101 | 2 |
| **Total** | | **30** |

Verdes hoje: **SEC-011** (cobertura de RLS). Os demais 29 estão `pendente` e ficam verdes conforme o
módulo dono é entregue.

## Quais SEC cada módulo precisa fazer passar (para o campo "Testes e segurança exigidos" dos módulos)

- F3 tenant-auth: 001, 002, 003, 040, 041, 042, 101
- F4 api-core: 002, 024, 080, 081, 090, 101
- F6 front-shell: 025, 042, 090
- API-config-llm: 020, 021, 022, 023, 024, 100, 101
- API-numeros: 022, 023, 024
- API-pagamentos: 023, 061
- API-clientes: 023, 001
- API-conta: 041, 042, 101
- ZAP-webhook: 050, 051, 031, 101
- ZAP-meta: 024, 050, 070
- ZAP-enviar: 031
- AT-llm: 022, 024, 026, 070, 100
- AT-motor-min / AT-entender: 051, 060, 061, 062
- AT-rag / AT-realimentar: 060, 062
- P-* (plataforma): 003, 023
- Todo módulo de dados novo: 001, 002, 010, 011, 081 (gerados pelo registry e pela descoberta de
  tabelas, entram sozinhos)

## Testes e segurança exigidos

- Os 30 `SEC-###` existem como testes com id no título e estão no `catalogo_estado.json`; o teste de
  rastreabilidade do F7 (etapa 13) passa.
- Cada item de negação tem seu espelho de permissão.
- **Revisão Opus obrigatória e final:** para cada superfície sensível (segredos C, privilégio D,
  auth E, webhook F, LLM G, SSRF H, e os módulos numeros, config-llm, pagamentos, rag, plataforma), um
  revisor **Opus** confere o código e os testes **contra este catálogo e o SEGURANCA.md**: o teste de
  fato reprova a violação (tentativa de quebrar de propósito), nada ficou fora do mapeamento, e a
  superfície nova foi acrescentada ao SEGURANCA.md (processo da seção 7) **antes** do merge. Teste verde
  sem revisão Opus não encerra a superfície.
- Superfícies novas que surgirem (feature futura) acrescentam seus `SEC-###` ao SEGURANCA.md e a este
  arquivo no mesmo PR.

## Notas e decisões

- **Teste acompanha o módulo:** o SEC é escrito no PR de entrega do módulo dono, não depois. Este
  arquivo é o mapa; o status por SEC no `catalogo_estado.json` é o painel vivo.
- **Modelo de LLM nos testes:** no gate do CI, sempre **modelo simulado determinístico** (sem custo,
  sem rede). Os testes com modelo real só rodam no loop periódico de red team, que alimenta novos SEC.
- **SEC-042 e SEC-100 têm parte não automatizável no CI** (configuração viva do painel do Supabase,
  canal real de alerta). Decisão: automatizar o que é código/configuração versionada e deixar a parte
  viva para o loop de red team, registrando isso no estado do item em vez de marcá-lo verde por
  inteiro.
- **Gerar casos do registry de rotas** (SEC-001, 002, 081) é decisão deliberada: rota nova entra na
  verificação sem alguém lembrar de escrever teste, e rota de escrita sem Zod quebra o gate.
- **Ordem sugerida de entrega** (por dano): C (segredos), D (privilégio), A (isolamento), B (RLS), F
  (webhook), E (auth), G, H, I, J, K.
