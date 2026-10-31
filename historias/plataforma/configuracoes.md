# P-configuracoes plataforma_configuracoes

- **ID:** P-configuracoes  ·  **Área:** P  ·  **Onda:** 4
- **Modelo sugerido:** Opus  ·  **Status:** `CONCLUIDO` (backend+front; cloud push e verificação ao
  vivo no navegador pendentes, ver Notas)
- **Reivindicado por:** (livre)

## Objetivo

Área nova no console `/plataforma` (`/plataforma/configuracoes`) para o admin do whaviso gerenciar
**credenciais de nível PLATAFORMA** (não de loja) que hoje só existiam em `.env` + redeploy, ou que
nem tinham lugar nenhum: a API key do Asaas (já era de banco, só faltava a tela), o número oficial
do WhatsApp do whaviso (zap), a chave do Resend (e-mail transacional) e um **pool de chaves de LLM**
que uma loja pode usar em vez de cadastrar a própria.

Nasceu de uma pergunta do Jeff ("falta um lugar pra eu colocar a chave de LLM que eu vou usar, e
talvez a conexão com o Asaas"); a investigação achou mais duas lacunas do mesmo tipo (WhatsApp
oficial e Resend) e o Jeff pediu as quatro juntas, cada uma com sua especificação própria, dentro de
uma mesma área "Configurações".

"Pronto" observável: `/plataforma/configuracoes` tem 4 abas (Asaas, WhatsApp oficial, E-mail, Pool
de IA); cada uma mostra `configurada: true/false` e deixa setar/rotacionar o segredo sem nunca
devolvê-lo numa resposta; o pool de IA lista as chaves cadastradas, deixa criar/ativar/desativar/
rotacionar, e a atribuição de uma chave do pool a uma loja específica acontece em
`/plataforma/usuarios` (ficha da conta), não aqui.

## Dependências

- `F4` api-core, `F3` tenant-auth (escopo de operador, permissão `chaves_api:gerir`).
- `API-pagamentos` / `0086_psp_recebedor_credencial.sql`: a credencial do Asaas (`credenciais_psp`)
  já existia; esta história só constrói a tela (zero mudança de backend no Asaas).
- `API-config-llm` / `0012_credenciais_llm.sql`: dono da BYO key por loja; esta história estende o
  mesmo módulo com o pool (ver addendum em `../backend-api/configuracoes_llm.md`).
- `P-usuarios`: a atribuição de chave do pool por loja mora na ficha da conta desse módulo (chamada
  HTTP direta às rotas do pool, sem importar o módulo).

## Contratos e tabelas que toca

- **Credencial do Asaas:** nenhuma tabela nova. `credenciais_psp` (já existente) sem alteração.
  Decisão explícita (ver Notas): `ASAAS_AMBIENTE`/`ASAAS_WALLET_ID`/`ASAAS_WEBHOOK_TOKEN`
  **continuam em `.env`** nesta rodada, não migraram pro banco.
- **WhatsApp oficial e e-mail (migration `0096_credenciais_plataforma.sql`):** duas tabelas
  singleton (molde `config_plataforma`, `id smallint primary key default 1`), semeadas vazias pela
  própria migration:
  - `credenciais_whatsapp_oficial`: `phone_number_id`, `waba_id`, `access_token_cifrado`.
  - `credenciais_email_plataforma`: `remetente`, `api_key_cifrada`.
  - Ambas cifradas com a `MASTER_KEY` já existente (mesma do token da Meta/chave Pix, kernel
    `@whaviso/shared/cifra`); `whaviso_api` escreve (nunca lê a coluna cifrada de volta, write-only
    por convenção de repo), `whaviso_zap` lê (decifra pra efetivamente enviar). Sem DELETE.
- **Pool de chaves de LLM (migration `0097_credenciais_llm_pool.sql`):** tabela nova
  `credenciais_llm_pool` (mesmo molde write-only de `credenciais_llm`, grant por coluna: `whaviso_api`
  escreve, `whaviso_atendente` lê a cifra). `credenciais_llm` ganha `pool_chave_id` (FK nullable) e
  `chave_cifrada` vira nullable, com `check` garantindo exatamente uma fonte setada.
- **Rotas:**
  - `GET/PUT /v1/pagamentos/psp/credencial` (já existia; só o consumo pelo front é novo).
  - `GET/PUT /v1/credenciais-plataforma/whatsapp-oficial` e `/email` (módulo novo
    `credenciais_plataforma`, prefixo `credenciais-plataforma`).
  - `GET/POST /v1/llm/pool`, `PATCH /v1/llm/pool/:id`, `PUT /v1/llm/pool/atribuicoes/:lojaId`
    (módulo `configuracoes_llm`, estendido).
  - Todas `acesso: 'plataforma'`, permissão `chaves_api:gerir` (reaproveitada, não criou permissão
    nova), rate limit apertado (5/min) nas de escrita.

## Arquivos (escopo de edição)

- `backend/supabase/migrations/0096_credenciais_plataforma.sql`,
  `backend/supabase/migrations/0097_credenciais_llm_pool.sql`
- `backend/apps/api/src/modules/credenciais_plataforma/**` (módulo novo: repo, cripto, schemas,
  service, routes, index, MODULE.md, teste de integração)
- `backend/apps/api/src/modules/configuracoes_llm/{repo,schemas,service,routes,MODULE.md}.ts` +
  `pool.test.ts` (extensão: pool de chaves)
- `backend/apps/atendente/src/shared/llm_client/credencial.ts` (resolução: junta com o pool quando
  `pool_chave_id` está setado) + `backend/apps/atendente/test/security/llm_sec.test.ts` (2 casos novos)
- `backend/apps/zap/src/{env.ts,server.ts}`, `backend/apps/zap/src/shared/credenciais_plataforma/repo.ts`
  (e-mail lido do banco a cada tick; WhatsApp oficial só armazenado, sem consumidor ainda)
- `backend/security/matriz/privilegios.ts` (entradas das 3 tabelas novas)
- `frontend/src/modules/plataforma_configuracoes/**` (módulo novo: contracts, api, pages, components)
- `frontend/src/modules/plataforma_usuarios/{api,schemas}.ts` +
  `components/FichaContaDialog.tsx` (seletor de atribuição de pool por loja)
- `frontend/src/app/arvore.tsx`, `frontend/src/app/layouts/OperadorShell.tsx` (rota + item de menu)

## Etapas

- [x] 1. Migration `0096` (WhatsApp oficial + e-mail) + módulo `credenciais_plataforma` (api) +
  leitura no zap (e-mail lido a cada tick; boot deixa de exigir `META_ACCESS_TOKEN`/
  `META_PHONE_NUMBER_ID`/`META_WABA_ID`) + teste de integração
  (commit: `c1c7c83 feat(plataforma): credenciais de plataforma administraveis`)
- [x] 2. Migration `0097` (pool de LLM) + CRUD do pool + atribuição por loja + resolução no
  atendente (falha fechada quando a chave do pool é desativada) + testes
  (commit: `7005832 feat(llm): pool de chaves de llm da plataforma, atribuivel por loja`)
- [x] 3. Matriz de privilégio (`backend/security/matriz/privilegios.ts`), `npm run test:security`
  verde (220 casos) antes de cada commit acima
- [x] 4. Frontend: módulo `plataforma_configuracoes` (4 abas), rota + item de menu "Configurações"
- [x] 5. Frontend: seletor de atribuição de pool na ficha da conta (`plataforma_usuarios`)
- [ ] 6. Aplicar `0096`/`0097` no Supabase cloud (`supabase db push`) — **bloqueado nesta sessão**
  (CLI recusou o token de acesso, 403; precisa do Jeff) — sem isso a api de dev (que aponta pro
  cloud) não tem as tabelas novas
- [ ] 7. Verificação manual no navegador (abrir `/plataforma/configuracoes` logado como operador
  admin, testar cada aba) — depende da etapa 6

## Testes e segurança exigidos

- **SEC-020/021/023/024** (mesmo molde de `credenciais_llm`/`credenciais_psp`): nenhuma resposta
  devolve o segredo; `api` nunca seleciona a coluna cifrada de volta (grant de tabela/coluna barra);
  nada em log.
- **SEC-030:** sem DELETE nas 3 tabelas novas (entrada em `TABELAS_CONHECIDAS`, testada pelo gate de
  completude de `matriz_privilegios.test.ts`).
- **SEC-022/032:** `whaviso_zap` lê `credenciais_whatsapp_oficial`/`credenciais_email_plataforma`;
  `whaviso_atendente` lê `credenciais_llm_pool`; nenhum dos dois lê a tabela do outro domínio.
- **Falha fechada no pool:** chave do pool desativada faz a loja atribuída cair em
  `llm_indisponivel`, nunca em outra credencial (testado em `llm_sec.test.ts`).
- 220 casos da matriz de privilégio verdes + suítes completas de `api`/`zap`/`atendente` verdes
  antes de cada commit (ver histórico de execução nesta sessão).

## Notas e decisões

- **Achado que muda a leitura do WhatsApp oficial:** `META_ACCESS_TOKEN`/`META_PHONE_NUMBER_ID`
  **não eram lidas em nenhum lugar do código além do boot-check** antes desta história — mover para
  o banco não mudou nenhum comportamento funcional; é trabalho preparatório para quando uma feature
  (OTP de login por telefone, notificação pelo número oficial) de fato consumir essa credencial.
  `META_APP_SECRET`/`META_VERIFY_TOKEN` continuam em `.env`: são do App Meta/webhook, compartilhados
  por todos os números (loja e oficial), não do número em si.
- **Asaas não ganhou migration nova.** O plano original cogitava trazer
  `ASAAS_AMBIENTE`/`ASAAS_WALLET_ID`/`ASAAS_WEBHOOK_TOKEN` pro banco junto da API key. Na prática,
  isso exigiria tornar `depsDeProducao`/`criarAsaasDoAmbiente` (hoje síncronos, cacheados uma vez no
  boot) assíncronos, mexendo na fiação de um caminho de pagamento/webhook ainda stub-gated (sem
  credenciais reais em produção). Decisão: entregar com segurança só a API key (gap real, zero
  risco) e tratar ambiente/wallet/webhook-token como follow-up quando o Asaas for de fato ativado.
- **Permissão reaproveitada:** todas as rotas novas usam `chaves_api:gerir` (já existente, já usada
  pelo Asaas), em vez de criar uma permissão por área — reduz churn na grade/migrations.
- **Pool de LLM, não é BYO:** a loja nunca escolhe "usar o pool" sozinha; é sempre o operador que
  atribui (`PUT /llm/pool/atribuicoes/:lojaId`), de propósito — decisão do Jeff ("essa é uma parte
  que eu gerencio"). A loja sempre pode voltar a cadastrar a própria chave normalmente, o que limpa
  a atribuição do pool.
- **Cloud push bloqueado nesta sessão:** `supabase db push` (via `npx supabase`) devolveu 403 no
  token de acesso configurado neste ambiente. As migrations estão validadas e verdes no Postgres
  LOCAL (`validate_migrations.sh whaviso_dev`) e toda a superfície foi provada por testes de
  integração reais contra esse banco; falta só aplicar no cloud (autorização permanente já existe
  pra isso, só faltou credencial de CLI funcional nesta sessão) e depois clicar nas 4 abas de
  verdade no navegador.
